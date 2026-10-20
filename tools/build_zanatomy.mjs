// Importa as 10 camadas do Anatomy Atlas 3D (geometria Z-Anatomy/BodyParts3D, CC BY-SA)
// para public/models/zanatomy/ e gera o manifesto lido pelo visualizador.
//
// Fonte esperada (primeira encontrada):
//   download/anatomy-atlas-3d-atlas-v0.1.3/_atlas_v2/dist/
//   _source/zanatomy/
// Cada camada precisa de <camada>.glb e all_<camada>_labeled_v2.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FMA_TO_ID } from '../src/data/catalog.js';
import { loadDict } from './i18n/dict.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'models', 'zanatomy');
const DRACO_SRC = path.join(ROOT, 'node_modules', 'three', 'examples', 'jsm', 'libs', 'draco', 'gltf');
const DRACO_OUT = path.join(ROOT, 'public', 'draco');
const SOURCES = [
  path.join(ROOT, 'download', 'anatomy-atlas-3d-atlas-v0.1.3', '_atlas_v2', 'dist'),
  path.join(ROOT, '_source', 'zanatomy'),
];

// Ordem = ordem dos filtros na interface.
const LAYERS = [
  { id: 'bones', kind: 'bone', label: 'Ossos', color: '#e6dcc6', visible: true },
  { id: 'teeth', kind: 'tooth', label: 'Dentes', color: '#f4f0e2', visible: true },
  { id: 'muscles', kind: 'muscle', label: 'Músculos', color: '#b8473f', visible: true },
  { id: 'fascia', kind: 'fascia', label: 'Fáscias', color: '#c9b49a', visible: false },
  { id: 'connective', kind: 'connective', label: 'Tecido conjuntivo (ligamentos, cápsulas, discos)', color: '#d9d2b0', visible: false },
  { id: 'vessels', kind: 'vessel', label: 'Vasos sanguíneos', color: '#9b59b6', visible: false },
  { id: 'nerves', kind: 'nerve', label: 'Nervos', color: '#f2d16b', visible: false },
  { id: 'brain', kind: 'brain', label: 'Encéfalo e medula espinal', color: '#e8b4a8', visible: false },
  { id: 'organs', kind: 'organ', label: 'Órgãos', color: '#c98a55', visible: false },
  { id: 'lymph', kind: 'lymph', label: 'Sistema linfático', color: '#83b98a', visible: false },
];
const VESSEL_COLORS = { artery: '#d9474f', vein: '#3d73d9' };

// Nomes Z-Anatomy que não coincidem literalmente com o FMA das fichas curadas.
const CURATED_ALIASES = {
  'lumbrical muscles of hand': 'lumbrical of hand',
  'dorsal interossei muscles of hand': 'dorsal interosseous of hand',
  'palmar interossei muscles': 'palmar interosseous',
  'opponens digiti minimi muscle of hand': 'opponens digiti minimi',
  'flexor digiti minimi of hand': 'flexor digiti minimi brevis of hand',
};

const fail = (msg) => { console.error(`ERRO: ${msg}`); process.exit(1); };

function readGlbNodes(file) {
  const b = fs.readFileSync(file);
  if (b.readUInt32LE(0) !== 0x46546c67) fail(`${file}: não é um GLB`);
  if (b.readUInt32LE(8) !== b.length) fail(`${file}: arquivo incompleto (tamanho divergente)`);
  const gltf = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString('utf8'));
  return gltf.nodes.filter((n) => n.mesh !== undefined).map((n) => n.name);
}

/** "(Acromial part of deltoid muscle)*" → "Acromial part of deltoid muscle" */
const cleanName = (s) => String(s ?? '').replace(/[()*]/g, '').replace(/\s+/g, ' ').trim();

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'estrutura';

/** Liga um músculo Z-Anatomy à ficha curada, se houver (ex.: partes do deltoide → deltoide). */
function curatedId(nameEn) {
  const n = nameEn.toLowerCase();
  const candidates = [n, n.replace(/\s+muscles?\b/g, '').trim()];
  const whole = n.match(/^.+? (?:part|parts|head|belly) of (.+)$/);
  if (whole) candidates.push(whole[1], whole[1].replace(/\s+muscles?\b/g, '').trim());
  for (const c of candidates) {
    const key = CURATED_ALIASES[c] ?? c;
    if (FMA_TO_ID.has(key)) return FMA_TO_ID.get(key);
  }
  return null;
}

function vesselType(nameEn) {
  const n = nameEn.toLowerCase();
  if (/\b(arter(y|ies|ial)|aorta|arch of aorta|arcade)\b/.test(n)) return 'artery';
  if (/\b(veins?|venous|vena|sinus)\b/.test(n)) return 'vein';
  // Troncos, arcos, anastomoses e ramos desta camada são todos arteriais.
  if (/\b(trunk|arch|anastomosis|branch(es)?|bifurcation)\b/.test(n)) return 'artery';
  return null;
}

// ── Fonte ─────────────────────────────────────────────────────────────
const src = SOURCES.find((d) => LAYERS.every((l) => fs.existsSync(path.join(d, `${l.id}.glb`))));
if (!src) {
  if (fs.existsSync(path.join(OUT, 'manifest.json'))) {
    console.log('Z-Anatomy: fonte não encontrada, mantendo os arquivos já importados em public/models/zanatomy.');
    process.exit(0);
  }
  fail(`camadas .glb não encontradas. Coloque-as em uma destas pastas:\n  ${SOURCES.join('\n  ')}`);
}

fs.mkdirSync(OUT, { recursive: true });
const dict = loadDict();
const untranslated = new Set();
const structures = [];
const layers = [];
let curatedCount = 0;

for (const layer of LAYERS) {
  const glb = path.join(src, `${layer.id}.glb`);
  const labelsFile = path.join(src, `all_${layer.id}_labeled_v2.json`);
  if (!fs.existsSync(labelsFile)) fail(`${labelsFile} não encontrado`);
  const labels = new Map(JSON.parse(fs.readFileSync(labelsFile, 'utf8')).map((x) => [x.id, x]));
  const nodes = readGlbNodes(glb);
  if (new Set(nodes).size !== nodes.length) fail(`${layer.id}.glb tem nós duplicados`);

  for (const node of nodes) {
    const label = labels.get(node);
    if (!label) fail(`${layer.id}.glb: nó "${node}" sem nome no JSON`);
    const nameEn = cleanName(label.en) || node;
    const side = label.side === 'l' ? 'L' : label.side === 'r' ? 'R' : null;
    const base = node.replace(/_(l|r)$/, '');
    const curated = layer.kind === 'muscle' ? curatedId(nameEn) : null;
    if (curated) curatedCount++;
    const sub = layer.kind === 'vessel' ? vesselType(nameEn) : null;
    const t = dict.translate(nameEn);
    if (!t) untranslated.add(nameEn);
    structures.push({
      key: `${layer.id}:${node}`,
      file: layer.id,
      node,
      kind: layer.kind,
      ...(sub ? { sub, color: VESSEL_COLORS[sub] } : {}),
      side,
      region: null,
      fichaId: curated ?? `${layer.kind}-${slug(base)}`,
      curated: Boolean(curated),
      nameEn,
      namePt: t?.pt ?? null,
      ...(t?.doubt ? { namePtReview: true } : {}),
    });
  }
  fs.copyFileSync(glb, path.join(OUT, `${layer.id}.glb`));
  layers.push({
    id: layer.id, kind: layer.kind, label: layer.label, color: layer.color,
    visible: layer.visible, url: `models/zanatomy/${layer.id}.glb`, count: nodes.length,
    bytes: fs.statSync(glb).size,
  });
  console.log(`  ${layer.id.padEnd(10)} ${String(nodes.length).padStart(4)} estruturas`);
}

if (new Set(structures.map((s) => s.key)).size !== structures.length) fail('chaves duplicadas no manifesto');
if (untranslated.size) fail(`${untranslated.size} nomes sem tradução em tools/i18n/pt-*.json:\n  ${[...untranslated].join('\n  ')}`);

const manifest = {
  schemaVersion: 3,
  source: {
    name: 'Anatomy Atlas 3D v0.1.3 (geometria Z-Anatomy / BodyParts3D)',
    license: 'CC BY-SA 4.0 (Z-Anatomy) / CC BY-SA 2.1 JP (BodyParts3D)',
    url: 'https://github.com/Grypa-JJ/anatomy-atlas-3d',
  },
  units: 'mm',
  up: 'Z',
  counts: {
    total: structures.length,
    curated: curatedCount,
    kinds: Object.fromEntries(layers.map((l) => [l.kind, l.count])),
  },
  layers,
  structures,
};
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest));
fs.writeFileSync(path.join(OUT, 'LICENSE.txt'), [
  'Modelos 3D desta pasta: adaptados do Anatomy Atlas 3D v0.1.3',
  '(https://github.com/Grypa-JJ/anatomy-atlas-3d), que deriva de:',
  '- Z-Anatomy (https://www.z-anatomy.com/), CC BY-SA 4.0',
  '- BodyParts3D, (c) Database Center for Life Science (DBCLS), CC BY-SA 2.1 JP',
  '',
  'Estes arquivos e quaisquer derivados permanecem sob licença CC BY-SA',
  '(compartilhamento pela mesma licença, com atribuição às fontes acima).',
  '',
].join('\n'));

// Decodificador Draco (Apache-2.0), servido localmente para funcionar offline.
if (!fs.existsSync(DRACO_SRC)) fail('decodificador Draco não encontrado; rode "npm install".');
fs.mkdirSync(DRACO_OUT, { recursive: true });
for (const f of ['draco_decoder.js', 'draco_decoder.wasm', 'draco_wasm_wrapper.js']) {
  fs.copyFileSync(path.join(DRACO_SRC, f), path.join(DRACO_OUT, f));
}

console.log(`OK: Z-Anatomy — ${structures.length} estruturas em ${layers.length} camadas (${curatedCount} malhas ligadas a fichas curadas)`);
