import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

const COLORS = {
  muscle: new THREE.Color('#b8473f'),
  bone: new THREE.Color('#e6dcc6'),
  fallback: new THREE.Color('#9aa0a9'),
  selected: new THREE.Color('#ffd166'),
};
const ROUGH = { bone: 0.75, tooth: 0.4 };
const REVEAL_KINDS = new Set(['muscle', 'fascia']);

/**
 * Visualizador 3D. Não conhece as fichas: trabalha com "estruturas" descritas
 * pelo manifesto ({ key, kind, side, fichaId, file?, node?, color? }). A UI decide o que mostrar.
 */
export class AnatomyViewer {
  constructor(container, { onSelect, onHover, dracoPath } = {}) {
    this.container = container;
    this.onSelect = onSelect ?? (() => {});
    this.onHover = onHover ?? (() => {});
    this.dracoPath = dracoPath ?? null;
    /** @type {Map<string, {mesh: THREE.Mesh, info: object, base: THREE.Color, hidden: boolean, ghost: boolean}>} */
    this.items = new Map();
    this.selectedKeys = new Set();
    this.hoverKey = null;
    this.filterFn = () => true;
    this._disposed = false;

    const w = container.clientWidth || 800;
    const h = container.clientHeight || 600;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.setAttribute('aria-label', 'Visualizador anatômico 3D. Arraste para girar, role para aproximar.');
    this.renderer.domElement.tabIndex = 0;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#14171c');

    this.camera = new THREE.PerspectiveCamera(35, w / h, 1, 20000);

    this.scene.add(new THREE.HemisphereLight('#ffffff', '#3a3330', 1.4));
    const key = new THREE.DirectionalLight('#ffffff', 1.6);
    key.position.set(1, 1.2, 1.5);
    this.camera.add(key); // luz acompanha a câmera
    const fill = new THREE.DirectionalLight('#ffffff', 0.5);
    fill.position.set(-1.5, -0.5, -1);
    this.camera.add(fill);
    this.scene.add(this.camera);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;
    this.controls.screenSpacePanning = true;
    this.controls.zoomToCursor = true;

    this.root = new THREE.Group();
    // BodyParts3D e Z-Anatomy usam Z para cima e milímetros: converte para Y para cima.
    this.root.rotation.x = -Math.PI / 2;
    this.scene.add(this.root);

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this._down = null;

    this._bind();
    this._resizeObserver = new ResizeObserver(() => this.resize());
    this._resizeObserver.observe(container);
    this._loop = this._loop.bind(this);
    this.renderer.setAnimationLoop(this._loop);
  }

  /**
   * Prepara o visualizador para um manifesto. As camadas são carregadas depois,
   * sob demanda, por loadFiles().
   * @param {{structures: object[], layers?: {kind: string, color: string}[]}} manifest
   * @param {string} defaultFile arquivo das estruturas sem campo "file"
   */
  setManifest(manifest, defaultFile) {
    this._loader = new GLTFLoader();
    if (this.dracoPath) {
      this._draco = new DRACOLoader();
      this._draco.setDecoderPath(this.dracoPath);
      this._loader.setDRACOLoader(this._draco);
    }
    const kindColors = new Map((manifest.layers ?? []).map((l) => [l.kind, new THREE.Color(l.color)]));
    this._colorFor = (info) => (info.color ? new THREE.Color(info.color) : kindColors.get(info.kind) ?? COLORS[info.kind] ?? COLORS.fallback);
    // O GLTFLoader "sanitiza" nomes de nós (remove ':' etc.), então comparamos
    // pela versão sanitizada do nome esperado.
    const sanitize = THREE.PropertyBinding.sanitizeNodeName;
    this._byFile = new Map();
    for (const s of manifest.structures) {
      const f = s.file ?? defaultFile;
      if (!this._byFile.has(f)) this._byFile.set(f, new Map());
      this._byFile.get(f).set(sanitize(s.node ?? s.key), s);
    }
    this.loadedFiles = new Set();
  }

  /** Atalho: prepara o manifesto e carrega todos os arquivos indicados. */
  async load(files, manifest, onProgress) {
    this.setManifest(manifest, files[0]?.id);
    await this.loadFiles(files, onProgress);
  }

  /**
   * Carrega GLBs e associa cada malha às informações do manifesto.
   * @param {{id: string, url: string, bytes?: number}[]} files
   */
  async loadFiles(files, onProgress) {
    files = files.filter((f) => !this.loadedFiles.has(f.id));
    if (!files.length) return;
    const loader = this._loader;
    const sanitize = THREE.PropertyBinding.sanitizeNodeName;
    const colorFor = this._colorFor;
    const byFile = this._byFile;

    const progress = new Map(files.map((f) => [f.id, { loaded: 0, total: f.bytes ?? 0 }]));
    const report = () => {
      if (!onProgress) return;
      let loaded = 0, total = 0;
      for (const p of progress.values()) { loaded += p.loaded; total += p.total; }
      if (total) onProgress(Math.min(1, loaded / total));
    };

    const scenes = await Promise.all(files.map(async (f) => {
      const gltf = await loader.loadAsync(f.url, (e) => {
        const p = progress.get(f.id);
        p.loaded = e.loaded;
        if (e.lengthComputable) p.total = e.total;
        report();
      });
      return { file: f, scene: gltf.scene };
    }));
    if (this._disposed) {
      for (const { scene } of scenes) scene.traverse((o) => o.isMesh && o.geometry.dispose());
      return;
    }

    for (const { file, scene } of scenes) {
      this.loadedFiles.add(file.id);
      const byName = byFile.get(file.id) ?? new Map();
      const orphans = [];
      scene.traverse((obj) => {
        if (!obj.isMesh) return;
        const info = byName.get(obj.name) ?? byName.get(sanitize(obj.name));
        if (!info) { orphans.push(obj); return; }
        if (!obj.geometry.attributes.normal) obj.geometry.computeVertexNormals();
        obj.geometry.computeBoundingBox();
        obj.geometry.computeBoundingSphere();
        const base = colorFor(info);
        obj.material = new THREE.MeshStandardMaterial({
          color: base,
          roughness: ROUGH[info.kind] ?? 0.55,
          metalness: 0,
          side: THREE.DoubleSide,
        });
        obj.userData.key = info.key;
        this.items.set(info.key, { mesh: obj, info, base, hidden: false, ghost: false });
      });
      // Malhas sem correspondência no manifesto não são exibidas.
      for (const o of orphans) { o.removeFromParent(); o.geometry.dispose(); }
      this.root.add(scene);
    }
    if (!this.items.size) throw new Error('O modelo carregou, mas nenhuma malha corresponde ao manifesto. Gere os modelos de novo.');

    this.root.updateMatrixWorld(true);
    this.refresh();
    // Os limites da câmera vêm da primeira carga (corpo inteiro); camadas
    // carregadas depois não mudam o enquadramento atual.
    if (!this.center) {
      const box = new THREE.Box3().setFromObject(this.root);
      this.center = box.getCenter(new THREE.Vector3());
      this.size = box.getSize(new THREE.Vector3());
      this.controls.minDistance = 20;
      this.controls.maxDistance = Math.max(this.size.x, this.size.y, this.size.z) * 4;
      this.view('front', false);
    }
  }

  /** Função que decide quais estruturas estão disponíveis (filtros da UI). */
  setFilter(fn) {
    this.filterFn = fn;
    this.refresh();
  }

  setHidden(key, hidden) {
    const it = this.items.get(key);
    if (it) { it.hidden = hidden; this.refresh(); }
  }

  setGhost(key, ghost) {
    const it = this.items.get(key);
    if (it) { it.ghost = ghost; this.refresh(); }
  }

  showAll() {
    for (const it of this.items.values()) { it.hidden = false; it.ghost = false; }
    this.isolated = null;
    this.refresh();
  }

  /** Isola um conjunto de chaves (null desfaz). Ossos permanecem como referência. */
  isolate(keys) {
    this.isolated = keys ? new Set(keys) : null;
    this.refresh();
  }

  select(keys) {
    this.selectedKeys = new Set(keys ?? []);
    this.refresh();
  }

  isVisible(key) {
    const it = this.items.get(key);
    return !!it && it.mesh.visible;
  }

  refresh() {
    let revealing = this.selectedKeys.size > 0;
    for (const k of this.selectedKeys) {
      const kind = this.items.get(k)?.info.kind;
      if (!kind || REVEAL_KINDS.has(kind) || kind === 'bone' || kind === 'tooth') { revealing = false; break; }
    }
    for (const [key, it] of this.items) {
      const inIsolation = !this.isolated || this.isolated.has(key) || it.info.kind === 'bone';
      const allowed = this.filterFn(it.info) && !it.hidden && inIsolation;
      it.mesh.visible = allowed;
      const m = it.mesh.material;
      const sel = this.selectedKeys.has(key);
      m.color.copy(sel ? COLORS.selected : it.base);
      m.emissive.set(sel ? '#5a3a00' : key === this.hoverKey ? '#2a2a2a' : '#000000');
      // Estruturas profundas (vasos, órgãos, nervos…) ficam escondidas sob a
      // musculatura: ao selecionar uma delas, músculos e fáscias ficam translúcidos.
      const reveal = revealing && !sel && (REVEAL_KINDS.has(it.info.kind) || it.info.kind === 'bone' || it.info.kind === 'tooth');
      const ghost = it.ghost || reveal || (this.ghostOthers && this.selectedKeys.size > 0 && !sel && it.info.kind !== 'bone');
      m.transparent = ghost;
      m.opacity = ghost ? 0.18 : 1;
      m.depthWrite = !ghost;
      it.mesh.renderOrder = ghost ? 2 : 0;
    }
  }

  /** Enquadra as estruturas visíveis (ou as chaves indicadas). */
  frame(keys, animate = true) {
    const box = new THREE.Box3();
    const list = keys ? [...keys].map((k) => this.items.get(k)).filter(Boolean) : [...this.items.values()].filter((i) => i.mesh.visible);
    for (const it of list) box.expandByObject(it.mesh);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const radius = box.getBoundingSphere(new THREE.Sphere()).radius;
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    const dist = Math.max(radius / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2)), 60);
    this._animateTo(center, center.clone().add(dir.multiplyScalar(dist)), animate);
  }

  /** Vistas: front, back, left, right, top. */
  view(name, animate = true) {
    if (!this.center) return;
    const dirs = {
      front: [0, 0, 1], back: [0, 0, -1],
      // "left" = lado esquerdo do corpo (câmera em +X do paciente)
      left: [1, 0, 0], right: [-1, 0, 0], top: [0, 1, 0.001],
    };
    const d = new THREE.Vector3(...(dirs[name] ?? dirs.front)).normalize();
    const visible = [...this.items.values()].filter((i) => i.mesh.visible);
    const box = new THREE.Box3();
    for (const it of visible) box.expandByObject(it.mesh);
    const target = box.isEmpty() ? this.center.clone() : box.getCenter(new THREE.Vector3());
    const radius = box.isEmpty() ? this.size.length() / 2 : box.getBoundingSphere(new THREE.Sphere()).radius;
    const dist = radius / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2)) * 0.75;
    this._animateTo(target, target.clone().add(d.multiplyScalar(dist)), animate);
  }

  reset() {
    this.view('front');
  }

  _animateTo(target, position, animate) {
    if (!animate) {
      this.controls.target.copy(target);
      this.camera.position.copy(position);
      this.controls.update();
      return;
    }
    this._anim = {
      t: 0,
      fromT: this.controls.target.clone(), toT: target,
      fromP: this.camera.position.clone(), toP: position,
    };
  }

  /**
   * Reserva uma faixa inferior da tela (ex.: ficha aberta no celular): o centro
   * visual do modelo sobe para a área ainda visível.
   */
  setBottomInset(px) {
    this.bottomInset = Math.max(0, px || 0);
    this.resize();
  }

  resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    const inset = Math.min(this.bottomInset ?? 0, h * 0.7);
    if (inset) this.camera.setViewOffset(w, h, 0, inset / 2, w, h); else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  _pick(ev) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const targets = [];
    for (const it of this.items.values()) {
      if (it.info.fichaId && it.mesh.visible && !it.mesh.material.transparent) targets.push(it.mesh);
    }
    const hit = this.raycaster.intersectObjects(targets, false)[0];
    return hit?.object.userData.key ?? null;
  }

  _bind() {
    const el = this.renderer.domElement;
    this._onDown = (e) => { this._down = { x: e.clientX, y: e.clientY }; };
    this._onUp = (e) => {
      if (!this._down) return;
      const moved = Math.hypot(e.clientX - this._down.x, e.clientY - this._down.y);
      this._down = null;
      if (moved > 6) return; // foi arrasto, não clique
      this.onSelect(this._pick(e));
    };
    this._onMove = (e) => {
      if (e.pointerType !== 'mouse' || e.buttons) return;
      cancelAnimationFrame(this._hoverRaf);
      this._hoverRaf = requestAnimationFrame(() => {
        const k = this._pick(e);
        if (k !== this.hoverKey) {
          this.hoverKey = k;
          el.style.cursor = k ? 'pointer' : 'grab';
          this.refresh();
          this.onHover(k, e);
        }
      });
    };
    this._onLeave = () => { if (this.hoverKey) { this.hoverKey = null; this.refresh(); this.onHover(null); } };
    el.addEventListener('pointerdown', this._onDown);
    el.addEventListener('pointerup', this._onUp);
    el.addEventListener('pointermove', this._onMove);
    el.addEventListener('pointerleave', this._onLeave);
  }

  _loop() {
    if (this._anim) {
      const a = this._anim;
      a.t = Math.min(1, a.t + 0.06);
      const k = 1 - Math.pow(1 - a.t, 3);
      this.controls.target.lerpVectors(a.fromT, a.toT, k);
      this.camera.position.lerpVectors(a.fromP, a.toP, k);
      if (a.t >= 1) this._anim = null;
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  /** Libera GPU e eventos ao sair da página. */
  dispose() {
    this._disposed = true;
    this.renderer.setAnimationLoop(null);
    this._resizeObserver.disconnect();
    cancelAnimationFrame(this._hoverRaf);
    const el = this.renderer.domElement;
    el.removeEventListener('pointerdown', this._onDown);
    el.removeEventListener('pointerup', this._onUp);
    el.removeEventListener('pointermove', this._onMove);
    el.removeEventListener('pointerleave', this._onLeave);
    this.controls.dispose();
    for (const it of this.items.values()) {
      it.mesh.geometry.dispose();
      it.mesh.material.dispose();
    }
    this.items.clear();
    this._draco?.dispose();
    this.renderer.dispose();
    el.remove();
  }
}
