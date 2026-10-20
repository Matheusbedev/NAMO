import { UPPER_LIMB_MUSCLES } from './muscles-upper-limb.js';

/** Catálogo completo de fichas (adicione novas regiões aqui). */
export const MUSCLES = [...UPPER_LIMB_MUSCLES];

const byId = new Map(MUSCLES.map((m) => [m.id, m]));
export const getMuscle = (id) => byId.get(id) ?? null;

/** Normaliza um nome FMA: minúsculas, sem lado ("left"/"right"). */
export function normalizeFma(name) {
  return name.toLowerCase().replace(/\b(left|right)\b/g, '').replace(/\s+/g, ' ').trim();
}

/** Mapa nome FMA normalizado → id da ficha. */
export const FMA_TO_ID = new Map();
for (const m of MUSCLES) for (const f of m.fma) FMA_TO_ID.set(normalizeFma(f), m.id);

/** Remove acentos para busca. */
export const fold = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
