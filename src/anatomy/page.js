import { AnatomyViewer } from './viewer.js';
import { store } from './store.js';
import { MUSCLES, fold } from '../data/catalog.js';
import { REGIONS, LAYERS } from '../data/regions.js';

const BASE = import.meta.env.BASE_URL;

/** Modelos 3D disponíveis. O primeiro é o padrão. */
const MODELS = {
  zanatomy: {
    label: 'Atlas completo: Z-Anatomy (10 sistemas)',
    manifest: 'models/zanatomy/manifest.json',
    source: 'Z-Anatomy',
    credit: 'Modelo: <a href="https://github.com/Grypa-JJ/anatomy-atlas-3d" target="_blank" rel="noopener">Anatomy Atlas 3D</a>, a partir de <a href="https://www.z-anatomy.com/" target="_blank" rel="noopener">Z-Anatomy</a> e BodyParts3D, CC BY-SA',
  },
  bp3d: {
    label: 'BodyParts3D: músculos e ossos',
    manifest: 'models/corpo-completo.json',
    files: [{ id: 'corpo', url: 'models/corpo-completo.glb' }],
    source: 'BodyParts3D/FMA',
    credit: 'Modelo: <a href="https://dbarchive.biosciencedbc.jp/en/bodyparts3d/" target="_blank" rel="noopener">BodyParts3D</a> © DBCLS, CC BY 4.0',
  },
};
/** Sistemas de manifestos antigos, que não descrevem camadas. */
const LEGACY_LAYERS = [
  { kind: 'muscle', label: 'Músculos', visible: true },
  { kind: 'bone', label: 'Ossos', visible: true },
];
const VESSEL_GROUPS = { artery: 'Artérias', vein: 'Veias' };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sideLabel = { L: 'esquerdo', R: 'direito' };

/** Monta a área de anatomia dentro de `root`. Retorna uma função de limpeza. */
export function mountAnatomy(root) {
  const modelId = MODELS[store.model()] ? store.model() : Object.keys(MODELS)[0];
  const model = MODELS[modelId];
  root.innerHTML = template(modelId, model);
  const $ = (sel) => root.querySelector(sel);

  const state = {
    query: '',
    region: 'all',
    tab: 'lista',
    side: 'both',
    peel: 0,
    layers: new Set([1, 2, 3]),
    kinds: new Set(),
    ghostOthers: false,
    selectedId: null,
    selectedSide: null,
    hiddenIds: new Set(),
    ghostIds: new Set(),
    isolatedId: null,
    available: new Set(),
  };

  let manifest = { structures: [] };
  let systems = LEGACY_LAYERS;
  let catalog = MUSCLES.map((m) => ({ ...m, kind: 'muscle', curated: true }));
  const entryById = new Map(catalog.map((m) => [m.id, m]));
  const getEntry = (id) => entryById.get(id) ?? null;
  const keysById = new Map();
  const structByKey = new Map();
  const systemLabel = (kind) => systems.find((l) => l.kind === kind)?.label ?? kind;
  const defaultKinds = () => new Set(systems.filter((l) => l.visible).map((l) => l.kind));

  const viewer = new AnatomyViewer($('#an-canvas'), {
    dracoPath: `${BASE}draco/`,
    onSelect: (key) => {
      if (!key) { selectMuscle(null); return; }
      const s = structByKey.get(key);
      selectMuscle(s?.fichaId ?? null, s?.side ?? null, false);
    },
    onHover: (key, ev) => {
      const tip = $('#an-tip');
      if (!key) { tip.hidden = true; return; }
      const s = structByKey.get(key);
      const m = getEntry(s?.fichaId);
      tip.textContent = m ? `${m.pt}${s.side ? ` (${sideLabel[s.side]})` : ''}` : '';
      const r = $('#an-canvas').getBoundingClientRect();
      tip.style.left = `${ev.clientX - r.left + 14}px`;
      tip.style.top = `${ev.clientY - r.top + 14}px`;
      tip.hidden = !m;
    },
  });

  function passes(info) {
    if (state.side !== 'both' && info.side && info.side !== state.side) return false;
    if (!state.kinds.has(info.kind)) return false;
    if (state.region !== 'all' && info.kind !== 'bone' && info.region !== state.region) return false;
    const m = getEntry(info.fichaId);
    if (!m) return true;
    if (m.layer && !state.layers.has(m.layer)) return false;
    if (m.layer && m.layer <= state.peel) return false;
    if (state.hiddenIds.has(m.id)) return false;
    return true;
  }

  function applyFilter() {
    viewer.ghostOthers = state.ghostOthers;
    for (const [id, keys] of keysById) for (const k of keys) {
      const it = viewer.items.get(k);
      if (it) it.ghost = state.ghostIds.has(id);
    }
    viewer.isolate(state.isolatedId ? keysById.get(state.isolatedId) : null);
    viewer.setFilter(passes);
    renderList();
    renderFicha();
  }

  function setKind(kind, on) {
    if (on) state.kinds.add(kind); else state.kinds.delete(kind);
    const box = root.querySelector(`[data-kind="${kind}"]`);
    if (box) box.checked = on;
    if (on) ensureKind(kind);
  }

  // ── Carga das camadas sob demanda (economiza dados no celular) ──
  const pendingLoads = new Map();
  const filesForKind = (kind) => (manifest.layers ?? []).filter((l) => l.kind === kind)
    .map((l) => ({ id: l.id, url: `${BASE}${l.url}`, bytes: l.bytes, label: l.label }));
  const isLoaded = (kind) => filesForKind(kind).every((f) => viewer.loadedFiles?.has(f.id));

  /** Garante que a camada do sistema esteja carregada; resolve quando estiver pronta. */
  function ensureKind(kind) {
    if (!viewer.loadedFiles || isLoaded(kind)) return Promise.resolve();
    if (pendingLoads.has(kind)) return pendingLoads.get(kind);
    const files = filesForKind(kind);
    const badge = $('#an-layer-loading');
    const label = files[0]?.label ?? systemLabel(kind);
    badge.hidden = false;
    badge.textContent = `Carregando ${label.toLowerCase()}…`;
    const p = viewer.loadFiles(files, (pct) => { badge.textContent = `Carregando ${label.toLowerCase()}… ${Math.round(pct * 100)}%`; })
      .then(() => { applyFilter(); })
      .catch((err) => {
        console.error(err);
        setKind(kind, false);
        applyFilter();
        alertMsg(`Não foi possível carregar ${label.toLowerCase()}. Verifique a conexão e tente ligar o sistema de novo.`);
      })
      .finally(() => {
        pendingLoads.delete(kind);
        if (!pendingLoads.size) badge.hidden = true;
      });
    pendingLoads.set(kind, p);
    return p;
  }

  function alertMsg(text) {
    const box = $('#an-layer-loading');
    box.hidden = false;
    box.textContent = text;
    setTimeout(() => { if (!pendingLoads.size) box.hidden = true; }, 5000);
  }

  function keysFor(id, side) {
    return (keysById.get(id) ?? []).filter((k) => !side || structByKey.get(k)?.side === side);
  }

  function selectMuscle(id, side = null, frame = true) {
    state.selectedId = id;
    state.selectedSide = side;
    const keys = id ? keysFor(id, side) : [];
    // Escolher na lista uma estrutura de sistema desligado religa esse sistema
    // (e carrega a camada, se ainda não estiver no aparelho).
    const kind = getEntry(id)?.kind;
    if (kind && keys.length && !state.kinds.has(kind)) { setKind(kind, true); viewer.setFilter(passes); }
    if (kind && keys.length && !isLoaded(kind)) {
      renderList(); renderFicha();
      ensureKind(kind).then(() => { if (state.selectedId === id) selectMuscle(id, side, frame); });
      return;
    }
    viewer.select(keys);
    if (id) {
      store.pushHistory(id);
      root.classList.add('has-selection');
    } else {
      root.classList.remove('has-selection');
    }
    // No celular a ficha ocupa a parte de baixo; o modelo é centrado acima dela.
    viewer.setBottomInset(id && mobile.matches ? $('#an-ficha').offsetHeight : 0);
    if (id && frame) {
      const vis = keys.filter((k) => viewer.isVisible(k));
      if (vis.length) viewer.frame(vis);
    }
    renderList();
    renderFicha();
  }

  function currentList() {
    let ids;
    if (state.tab === 'favoritos') ids = store.favorites();
    else if (state.tab === 'historico') ids = store.history();
    else ids = catalog.map((m) => m.id);
    const q = fold(state.query.trim());
    return ids.map(getEntry).filter(Boolean).filter((m) => {
      if (state.region !== 'all' && m.region !== state.region) return false;
      // Sem busca, a lista acompanha os sistemas ligados; a busca procura em todos.
      if (!q) return state.tab !== 'lista' || state.kinds.has(m.kind);
      m._q ??= fold([m.pt, m.la, m.nameEn, m.group].filter(Boolean).join(' '));
      return m._q.includes(q);
    });
  }

  function renderList() {
    const list = currentList();
    const ul = $('#an-list');
    $('#an-clear-hist').hidden = state.tab !== 'historico';
    $('#an-count').textContent = `${list.length} ${list.length === 1 ? 'estrutura' : 'estruturas'}`;
    if (!list.length) {
      const msg = state.tab === 'favoritos' ? 'Nenhum favorito ainda. Abra uma ficha e toque na estrela.'
        : state.tab === 'historico' ? 'Nenhuma estrutura consultada ainda.'
        : 'Nenhuma estrutura encontrada. Ligue mais sistemas ou mude a busca.';
      ul.innerHTML = `<li class="an-empty">${msg}</li>`;
      return;
    }
    let lastGroup = null;
    const html = [];
    // Listas enormes travam celulares; acima do limite, pede-se para refinar a busca.
    const LIMIT = 400;
    for (const m of list.slice(0, LIMIT)) {
      if (state.tab === 'lista' && m.group !== lastGroup) {
        html.push(`<li class="an-group" role="presentation">${esc(m.group)}</li>`);
        lastGroup = m.group;
      }
      const missing = !state.available.has(m.id);
      const hidden = state.hiddenIds.has(m.id);
      const layer = m.layer ? LAYERS[m.layer - 1]?.label : null;
      html.push(`<li><button type="button" class="an-item${m.id === state.selectedId ? ' is-active' : ''}${hidden ? ' is-hidden' : ''}" data-id="${m.id}">
        <span class="an-item-name">${esc(m.pt)}</span>
        ${layer ? `<span class="an-badge l${m.layer}" title="Camada ${esc(layer)}">${esc(layer[0])}</span>` : ''}
        ${!m.curated ? `<span class="an-badge generated" title="Identificação ${esc(model.source)}; ficha detalhada em curadoria">base</span>` : ''}
        ${missing ? '<span class="an-badge warn" title="Sem malha 3D neste modelo">sem 3D</span>' : ''}
        ${hidden ? '<span class="an-badge">oculto</span>' : ''}
      </button></li>`);
    }
    if (list.length > LIMIT) html.push(`<li class="an-empty">Mostrando ${LIMIT} de ${list.length}. Use a busca ou desligue sistemas para ver as demais.</li>`);
    ul.innerHTML = html.join('');
  }

  function renderFicha() {
    const box = $('#an-ficha');
    const m = getEntry(state.selectedId);
    if (!m) {
      box.innerHTML = '<div class="an-ficha-empty"><p>Clique ou toque em uma estrutura no modelo, ou escolha uma na lista.</p></div>';
      return;
    }
    const fav = store.isFavorite(m.id);
    const hidden = state.hiddenIds.has(m.id);
    const ghost = state.ghostIds.has(m.id);
    const isolated = state.isolatedId === m.id;
    const has3d = state.available.has(m.id);
    const visibleNow = (keysById.get(m.id) ?? []).some((k) => viewer.isVisible(k));
    const field = (label, v) => `<dt>${label}</dt><dd>${v ? esc(v) : '<span class="an-na">Não informado</span>'}</dd>`;
    const region = REGIONS.find((r) => r.id === m.region)?.label;
    const isMuscle = m.kind === 'muscle';
    const dis = has3d ? '' : 'disabled';
    const untranslated = !m.curated && !m.namePt;
    const loading = has3d && !isLoaded(m.kind);
    box.innerHTML = `
      <header class="an-ficha-head">
        <div>
          <h2 id="an-ficha-title">${esc(m.pt)}</h2>
          ${m.la ? `<p class="an-latin" lang="la">${esc(m.la)}</p>` : ''}
        </div>
        <button type="button" class="an-icon-btn" data-act="fav" aria-pressed="${fav}" aria-label="${fav ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}" title="${fav ? 'Remover dos favoritos' : 'Favoritar'}">${fav ? '★' : '☆'}</button>
        <button type="button" class="an-icon-btn an-close" data-act="close" aria-label="Fechar ficha" title="Fechar">✕</button>
      </header>
      ${!m.curated ? `<p class="an-info">${untranslated
        ? `Nome em inglês, como na fonte ${esc(model.source)}.`
        : `Nome em português conforme a Terminologia Anatômica; o nome original da fonte ${esc(model.source)} aparece abaixo.`}
        ${m.namePtReview ? ' <strong>Tradução marcada para revisão</strong> (termo sem equivalente direto ou com mais de uma forma em uso).' : ''}
        ${isMuscle ? ' Origem, inserção, inervação e ação ainda não foram curadas para esta estrutura.' : ''}</p>` : ''}
      ${!has3d ? '<p class="an-warn">Esta ficha não possui malha individual neste modelo.</p>' : ''}
      ${loading ? '<p class="an-info">Carregando a camada 3D desta estrutura…</p>' : ''}
      ${has3d && !loading && !visibleNow ? '<p class="an-warn">A estrutura está oculta pelos filtros atuais (sistema, camada, lado ou visibilidade).</p>' : ''}
      <div class="an-actions" role="group" aria-label="Ações da estrutura">
        <button type="button" data-act="frame" ${dis}>Enquadrar</button>
        <button type="button" data-act="isolate" aria-pressed="${isolated}" ${dis}>${isolated ? 'Desfazer isolamento' : 'Isolar'}</button>
        <button type="button" data-act="ghost" aria-pressed="${ghost}" ${dis}>${ghost ? 'Opaco' : 'Transparente'}</button>
        <button type="button" data-act="hide" aria-pressed="${hidden}" ${dis}>${hidden ? 'Mostrar' : 'Ocultar'}</button>
      </div>
      <dl class="an-fields">
        ${field('Sistema', m.group && m.group !== systemLabel(m.kind) ? `${systemLabel(m.kind)}: ${m.group}` : systemLabel(m.kind))}
        ${m.region ? field('Região', region ?? m.region) : ''}
        ${m.nameEn && m.nameEn !== m.pt ? field('Nome original (inglês)', m.nameEn) : ''}
        ${m.fmaId ? field('Identificador FMA', m.fmaId) : ''}
        ${isMuscle ? field('Camada', m.layer ? LAYERS[m.layer - 1]?.label : null) : ''}
        ${state.selectedSide ? field('Lado selecionado', sideLabel[state.selectedSide]) : ''}
        ${isMuscle ? `${field('Localização', m.location)}${field('Origem', m.origin)}${field('Inserção', m.insertion)}${field('Inervação', m.innervation)}${field('Ação', m.action)}` : ''}
      </dl>`;
  }

  // ── Eventos ──
  $('#an-model').addEventListener('change', (e) => {
    store.setModel(e.target.value);
    // O roteador desmonta esta página (liberando a GPU) e a monta com o novo modelo.
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
  $('#an-search').addEventListener('input', (e) => { state.query = e.target.value; renderList(); });
  $('#an-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]');
    if (!b) return;
    // No celular, fecha o painel para mostrar o modelo com a estrutura escolhida.
    if (mobile.matches) setPanel(false);
    selectMuscle(b.dataset.id === state.selectedId ? null : b.dataset.id);
  });

  // ── Painel de filtros como gaveta no celular ──
  const mobile = window.matchMedia('(max-width: 720px)');
  const anatomyEl = root.querySelector('.anatomy');
  function setPanel(open) {
    anatomyEl.classList.toggle('show-panel', open);
    $('#an-panel-toggle').setAttribute('aria-expanded', String(open));
    $('#an-panel-toggle').textContent = open ? 'Ver modelo' : 'Buscar e filtrar';
    if (open) { root.classList.remove('has-selection'); viewer.setBottomInset(0); }
  }
  $('#an-panel-toggle').addEventListener('click', () => setPanel(!anatomyEl.classList.contains('show-panel')));
  $('#an-panel-close').addEventListener('click', () => setPanel(false));
  root.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
    state.tab = b.dataset.tab;
    root.querySelectorAll('[data-tab]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    renderList();
  }));
  $('#an-region').addEventListener('change', (e) => {
    state.region = e.target.value || 'all';
    applyFilter();
    const keys = manifest.structures
      .filter((s) => s.kind !== 'bone' && (state.region === 'all' || s.region === state.region))
      .map((s) => s.key).filter((k) => viewer.isVisible(k));
    viewer.frame(keys.length ? keys : undefined);
  });
  $('#an-side').addEventListener('change', (e) => { state.side = e.target.value; applyFilter(); });
  $('#an-peel').addEventListener('input', (e) => {
    state.peel = Number(e.target.value);
    $('#an-peel-out').textContent = ['Nenhuma', 'Superficial', 'Superficial + intermediária'][state.peel];
    applyFilter();
  });
  root.querySelectorAll('[data-layer]').forEach((c) => c.addEventListener('change', () => {
    const n = Number(c.dataset.layer);
    if (c.checked) state.layers.add(n); else state.layers.delete(n);
    applyFilter();
  }));
  $('#an-systems').addEventListener('change', (e) => {
    const kind = e.target.dataset.kind;
    if (!kind) return;
    setKind(kind, e.target.checked);
    applyFilter();
  });
  $('#an-ghost-others').addEventListener('change', (e) => { state.ghostOthers = e.target.checked; applyFilter(); });
  root.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => viewer.view(b.dataset.view)));
  $('#an-reset').addEventListener('click', () => {
    Object.assign(state, { side: 'both', region: 'all', peel: 0, layers: new Set([1, 2, 3]), ghostOthers: false, isolatedId: null });
    state.hiddenIds.clear(); state.ghostIds.clear();
    state.kinds = new Set();
    for (const l of systems) setKind(l.kind, l.visible);
    $('#an-side').value = 'both'; $('#an-region').value = 'all'; $('#an-peel').value = 0; $('#an-peel-out').textContent = 'Nenhuma';
    root.querySelectorAll('[data-layer]').forEach((c) => { c.checked = true; });
    $('#an-ghost-others').checked = false;
    selectMuscle(null);
    applyFilter();
    viewer.reset();
  });
  $('#an-showall').addEventListener('click', () => {
    state.hiddenIds.clear(); state.ghostIds.clear(); state.isolatedId = null;
    applyFilter();
  });
  $('#an-clean').addEventListener('click', () => {
    const on = root.querySelector('.anatomy').classList.toggle('is-clean');
    $('#an-clean').setAttribute('aria-pressed', String(on));
    $('#an-clean').textContent = on ? 'Interface completa' : 'Visualização limpa';
  });
  $('#an-clear-hist').addEventListener('click', () => { store.clearHistory(); renderList(); });

  const creditBox = $('#an-credit-box');
  const toggleCredit = (on) => {
    const open = on ?? creditBox.hidden;
    creditBox.hidden = !open;
    $('#an-credit-btn').setAttribute('aria-expanded', String(open));
  };
  $('#an-credit-btn').addEventListener('click', () => toggleCredit());
  creditBox.querySelector('.an-credit-close').addEventListener('click', () => toggleCredit(false));

  $('#an-ficha').addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    const id = state.selectedId;
    if (!act || !id) return;
    if (act === 'close') { selectMuscle(null); return; }
    if (act === 'fav') { store.toggleFavorite(id); renderList(); renderFicha(); return; }
    if (act === 'frame') {
      const ks = keysFor(id, state.selectedSide).filter((k) => viewer.isVisible(k));
      if (ks.length) viewer.frame(ks);
      return;
    }
    if (act === 'hide') { toggle(state.hiddenIds, id); if (state.isolatedId === id) state.isolatedId = null; }
    if (act === 'ghost') toggle(state.ghostIds, id);
    if (act === 'isolate') state.isolatedId = state.isolatedId === id ? null : id;
    applyFilter();
    if (act === 'isolate' && state.isolatedId) {
      const ks = keysById.get(id).filter((k) => viewer.isVisible(k));
      if (ks.length) viewer.frame(ks);
    }
  });

  const onKey = (e) => {
    if (e.target.matches('input, textarea, select')) return;
    if (e.key === 'Escape') selectMuscle(null);
  };
  window.addEventListener('keydown', onKey);

  /** Monta a lista de sistemas e o catálogo a partir do manifesto carregado. */
  function indexManifest() {
    systems = (manifest.layers ?? LEGACY_LAYERS).map((l) => ({
      ...l, count: l.count ?? manifest.counts?.[`${l.kind === 'bone' ? 'bones' : 'muscles'}`] ?? 0,
    }));
    state.kinds = defaultKinds();
    $('#an-systems').innerHTML = systems.map((l) => `<label><input type="checkbox" data-kind="${esc(l.kind)}" ${l.visible ? 'checked' : ''}>
      ${l.color ? `<span class="an-swatch" style="background:${esc(l.color)}" aria-hidden="true"></span>` : ''}${esc(l.label)} <span class="an-muted">${l.count || ''}</span></label>`).join('');

    // Regiões só existem no BodyParts3D; nos demais modelos o filtro some.
    const hasRegions = manifest.structures.some((s) => s.kind !== 'bone' && s.region);
    $('#an-region-field').hidden = !hasRegions;
    $('.an-row').classList.toggle('is-single', !hasRegions);

    // O manifesto é também o inventário completo. Estruturas sem ficha curada
    // continuam pesquisáveis, selecionáveis e identificadas pela fonte.
    for (const s of manifest.structures) {
      if (!s.fichaId || entryById.has(s.fichaId)) continue;
      const regionLabel = REGIONS.find((r) => r.id === s.region)?.label;
      const group = s.kind === 'muscle' && regionLabel ? regionLabel
        : s.kind === 'vessel' ? VESSEL_GROUPS[s.sub] ?? 'Outros vasos'
        : systemLabel(s.kind);
      const entry = {
        id: s.fichaId, pt: s.namePt || s.nameEn, namePt: s.namePt, la: s.latin, nameEn: s.nameEn,
        fmaId: s.fmaId, region: s.region, kind: s.kind, group,
        layer: null, location: regionLabel ?? null, origin: null, insertion: null,
        innervation: null, action: null, curated: false, namePtReview: Boolean(s.namePtReview),
      };
      entryById.set(entry.id, entry);
      catalog.push(entry);
    }
    const order = new Map(systems.map((l, i) => [l.kind, i]));
    catalog.sort((a, b) => (order.get(a.kind) ?? 99) - (order.get(b.kind) ?? 99)
      || (a.group ?? '').localeCompare(b.group ?? '', 'pt-BR') || a.pt.localeCompare(b.pt, 'pt-BR'));
    keysById.clear(); structByKey.clear();
    for (const s of manifest.structures) {
      structByKey.set(s.key, s);
      if (!s.fichaId) continue;
      if (!keysById.has(s.fichaId)) keysById.set(s.fichaId, []);
      keysById.get(s.fichaId).push(s.key);
    }
    state.available = new Set(keysById.keys());
    const total = manifest.counts?.total ?? manifest.structures.length;
    $('#an-model-stats').textContent = `${total} estruturas 3D • ${systems.length} sistemas`;
  }

  async function load() {
    const overlay = $('#an-loading');
    overlay.hidden = false;
    overlay.innerHTML = '<div class="an-spinner" aria-hidden="true"></div><p>Carregando modelo 3D… <span id="an-pct">0%</span></p>';
    try {
      const res = await fetch(`${BASE}${model.manifest}`);
      if (!res.ok) throw new Error(`Manifesto não encontrado (${res.status}). Rode ${modelId === 'zanatomy' ? '"npm run data:zanatomy"' : '"npm run data"'} para gerar os modelos.`);
      manifest = await res.json();
      indexManifest();
      renderList(); // a lista já pode ser consultada enquanto o 3D carrega
      // Só as camadas ligadas por padrão são baixadas agora; as demais, ao ligar o sistema.
      const files = manifest.layers
        ? manifest.layers.filter((l) => l.visible).map((l) => ({ id: l.id, url: `${BASE}${l.url}`, bytes: l.bytes }))
        : model.files.map((f) => ({ ...f, url: `${BASE}${f.url}` }));
      viewer.setManifest(manifest, files[0]?.id);
      await viewer.loadFiles(files, (p) => { const el = $('#an-pct'); if (el) el.textContent = `${Math.round(p * 100)}%`; });
      overlay.hidden = true;
      applyFilter();
      viewer.view('front', false);
    } catch (err) {
      console.error(err);
      overlay.innerHTML = `<p class="an-error" role="alert">Não foi possível carregar o modelo 3D.<br><small>${esc(err.message)}</small></p><button type="button" id="an-retry">Tentar novamente</button>`;
      // Recarregar remonta a página inteira, evitando malhas duplicadas de uma carga parcial.
      overlay.querySelector('#an-retry').addEventListener('click', () => window.dispatchEvent(new HashChangeEvent('hashchange')));
    }
  }

  root.classList.remove('has-selection');
  renderList();
  renderFicha();
  load();

  return () => {
    window.removeEventListener('keydown', onKey);
    // #app sobrevive à troca de página; sem isso a ficha reabriria vazia ao voltar.
    root.classList.remove('has-selection');
    viewer.dispose();
  };
}

function toggle(set, v) { if (set.has(v)) set.delete(v); else set.add(v); }

function template(modelId, model) {
  const regionOpts = REGIONS.map((r) => `<option value="${r.id}" ${r.id === 'all' ? 'selected' : ''}>${r.label}</option>`).join('');
  const modelOpts = Object.entries(MODELS).map(([id, m]) => `<option value="${id}" ${id === modelId ? 'selected' : ''}>${esc(m.label)}</option>`).join('');
  return `
  <section class="anatomy" aria-label="Atlas anatômico 3D">
    <div class="an-toolbar" role="toolbar" aria-label="Controles de visualização">
      <button type="button" id="an-panel-toggle" class="an-panel-toggle" aria-controls="an-left" aria-expanded="false">Buscar e filtrar</button>
      <div class="an-tool-group an-views" role="group" aria-label="Vistas">
        <button type="button" data-view="front">Frente</button>
        <button type="button" data-view="back">Costas</button>
        <button type="button" data-view="left" title="Vista do lado esquerdo do corpo">Lateral E</button>
        <button type="button" data-view="right" title="Vista do lado direito do corpo">Lateral D</button>
      </div>
      <div class="an-tool-group">
        <button type="button" id="an-reset" title="Restaura câmera, filtros e visibilidade">Restaurar</button>
        <button type="button" id="an-showall">Mostrar tudo</button>
        <button type="button" id="an-clean" aria-pressed="false">Visualização limpa</button>
      </div>
    </div>

    <aside id="an-left" class="an-panel an-left" aria-label="Pesquisa e filtros">
      <div class="an-sheet-head"><strong>Buscar e filtrar</strong><button type="button" id="an-panel-close" class="an-icon-btn" aria-label="Fechar painel">✕</button></div>
      <label class="an-field">
        <span>Modelo 3D</span>
        <select id="an-model">${modelOpts}</select>
      </label>
      <label class="an-field">
        <span>Buscar estrutura</span>
        <input id="an-search" type="search" placeholder="Ex.: deltoide, aorta, fêmur…" autocomplete="off" enterkeyhint="search">
      </label>
      <div class="an-row">
        <label class="an-field" id="an-region-field"><span>Região</span>
          <select id="an-region">${regionOpts}</select>
        </label>
        <label class="an-field"><span>Lado</span>
          <select id="an-side">
            <option value="both">Ambos</option>
            <option value="L">Esquerdo</option>
            <option value="R">Direito</option>
          </select>
        </label>
      </div>
      <fieldset class="an-fieldset">
        <legend>Sistemas</legend>
        <div id="an-systems" class="an-checks an-systems"></div>
      </fieldset>
      <fieldset class="an-fieldset">
        <legend>Camadas musculares (fichas curadas)</legend>
        <div class="an-checks">
          ${LAYERS.map((l) => `<label><input type="checkbox" data-layer="${l.id}" checked> ${l.label}</label>`).join('')}
        </div>
        <label class="an-field">
          <span>Remover camadas: <output id="an-peel-out">Nenhuma</output></span>
          <input id="an-peel" type="range" min="0" max="2" step="1" value="0">
        </label>
      </fieldset>
      <div class="an-checks">
        <label><input type="checkbox" id="an-ghost-others"> Transparência nos demais ao selecionar</label>
      </div>

      <div class="an-tabs" role="tablist">
        <button type="button" role="tab" data-tab="lista" aria-selected="true">Lista</button>
        <button type="button" role="tab" data-tab="favoritos" aria-selected="false">Favoritos</button>
        <button type="button" role="tab" data-tab="historico" aria-selected="false">Histórico</button>
      </div>
      <div class="an-list-head"><span id="an-count"></span><span id="an-model-stats" class="an-model-stats">Carregando inventário…</span><button type="button" id="an-clear-hist" class="an-link" hidden>Limpar histórico</button></div>
      <ul id="an-list" class="an-list"></ul>
    </aside>

    <div class="an-stage">
      <div id="an-canvas" class="an-canvas"></div>
      <div id="an-tip" class="an-tip" hidden></div>
      <div id="an-loading" class="an-loading" aria-live="polite"></div>
      <div id="an-layer-loading" class="an-layer-loading" role="status" hidden></div>
      <p class="an-credit"><button type="button" id="an-credit-btn" class="an-credit-btn" aria-expanded="false">Créditos e licença</button> · feito por Matheus Augusto</p>
      <div id="an-credit-box" class="an-credit-box" hidden>
        <button type="button" class="an-icon-btn an-credit-close" aria-label="Fechar">✕</button>
        <h3>Créditos e licença</h3>
        <p>${model.credit}</p>
        <p>Modelos 3D sob licença <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.pt_BR" target="_blank" rel="noopener">CC BY-SA</a>, herdada de <a href="https://www.z-anatomy.com/" target="_blank" rel="noopener">Z-Anatomy</a> e <a href="https://dbarchive.biosciencedbc.jp/en/bodyparts3d/" target="_blank" rel="noopener">BodyParts3D</a> © DBCLS. Nomes em português conforme a <em>Terminologia Anatômica</em> (SBA/FIPAT). Visualizador em <a href="https://threejs.org" target="_blank" rel="noopener">three.js</a> (MIT) com decodificador <a href="https://google.github.io/draco/" target="_blank" rel="noopener">Draco</a> (Apache-2.0).</p>
        <p class="an-muted">Material de apoio ao estudo. Confira sempre com a bibliografia da sua disciplina.</p>
        <p class="an-muted">Desenvolvido por Matheus Augusto.</p>
      </div>
    </div>

    <aside id="an-ficha" class="an-panel an-right" aria-live="polite" aria-labelledby="an-ficha-title"></aside>
  </section>`;
}
