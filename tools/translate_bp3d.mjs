// Aplica os nomes em português (tools/i18n/pt-*.json) ao manifesto BodyParts3D
// (public/models/corpo-completo.json) e corrige as 8 malhas cujo arquivo OBJ veio
// sem nome. A identificação dessas 8 foi feita pela tabela FMA IS-A da própria
// fonte (_source/isa_element_parts.txt), escolhendo o conceito mais específico.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDict, normKey } from './i18n/dict.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'public', 'models', 'corpo-completo.json');

const UNNAMED = {
  FJ1450: ['external anal sphincter', 'FMA21930'],
  FJ1451: ['external intercostal muscle', 'FMA9756'],
  FJ1454: ['innermost intercostal muscle', 'FMA9758'],
  FJ1455: ['internal intercostal muscle', 'FMA9757'],
  FJ1525: ['thoracic rotator', 'FMA23083'],
  FJ1543: ['spinalis', 'FMA77179'],
  FJ1547: ['lateral lumbar intertransversarius', 'FMA22850'],
  FJ1548: ['medial lumbar intertransversarius', 'FMA22851'],
};
const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const dict = loadDict();
const manifest = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const idByName = new Map();
for (const s of manifest.structures) if (s.nameEn && !s.nameEn.startsWith('#')) idByName.set(normKey(s.nameEn), s.fichaId);

let fixed = 0;
const missing = new Set();
for (const s of manifest.structures) {
  const fix = UNNAMED[s.sourceFile];
  if (fix && (!s.nameEn || s.nameEn.startsWith('#'))) {
    const [name, fma] = fix;
    s.nameEn = name;
    s.fmaId = fma;
    s.fichaId = idByName.get(normKey(name)) ?? `fma-${slug(name)}`;
    fixed++;
  }
  const t = dict.translate(s.nameEn);
  if (t) { s.namePt = t.pt; s.namePtReview = t.doubt || undefined; } else missing.add(s.nameEn);
}
const broken = manifest.structures.filter((s) => !s.nameEn || s.nameEn.startsWith('#') || String(s.fmaId ?? '').startsWith('#'));
if (broken.length) { console.error(`ERRO: ${broken.length} estruturas ainda sem nome válido`); process.exit(1); }
if (missing.size) { console.error(`ERRO: sem tradução: ${[...missing].join(' | ')}`); process.exit(1); }
fs.writeFileSync(FILE, JSON.stringify(manifest));
console.log(`OK: BodyParts3D — ${manifest.structures.length} nomes em português (${fixed} malhas sem nome corrigidas)`);
