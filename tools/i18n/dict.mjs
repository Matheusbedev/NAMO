// Dicionário inglês → português do Brasil dos nomes anatômicos (arquivos pt-*.json).
// As regras de tradução estão em REGRAS.md. Termos listados em "_duvidas" são
// marcados para revisão na interface.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROMAN = 'I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII';

/** Normaliza a chave: minúsculas, sem pontuação de origem e espaços extras. */
export const normKey = (s) => String(s ?? '').toLowerCase().replace(/[()*.'’]/g, '').replace(/\s+/g, ' ').trim();

/** Ajustes de padronização aplicados a todas as traduções. */
function polish(pt) {
  return pt
    // Nervos cranianos: "Nervo vago X" → "Nervo vago (NC X)"
    .replace(new RegExp(`^(Nervo [^()]+?) (${ROMAN})$`), '$1 (NC $2)')
    .replace(/\s+/g, ' ')
    .trim();
}

export function loadDict() {
  const map = new Map();
  const doubts = new Set();
  for (const file of fs.readdirSync(DIR).filter((f) => /^pt-.+\.json$/.test(f)).sort()) {
    const data = JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8').replace(/^\uFEFF/, ''));
    for (const d of data._duvidas ?? []) doubts.add(normKey(d));
    for (const [en, pt] of Object.entries(data)) {
      if (en === '_duvidas' || en.startsWith('#') || typeof pt !== 'string' || !pt.trim()) continue;
      const k = normKey(en);
      if (!map.has(k)) map.set(k, polish(pt));
    }
  }
  return {
    size: map.size,
    /** @returns {{pt: string, doubt: boolean} | null} */
    translate(nameEn) {
      const k = normKey(nameEn);
      const pt = map.get(k);
      return pt ? { pt, doubt: doubts.has(k) } : null;
    },
  };
}
