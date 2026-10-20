/** Persistência local de favoritos e histórico (localStorage, com fallback). */
const KEY_FAV = 'rea.anatomia.favoritos';
const KEY_HIST = 'rea.anatomia.historico';
const KEY_MODEL = 'rea.anatomia.modelo';
const HIST_MAX = 30;

function read(key) {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* armazenamento indisponível */ }
}

export const store = {
  favorites: () => read(KEY_FAV),
  isFavorite: (id) => read(KEY_FAV).includes(id),
  toggleFavorite(id) {
    const list = read(KEY_FAV);
    const i = list.indexOf(id);
    if (i >= 0) list.splice(i, 1); else list.unshift(id);
    write(KEY_FAV, list);
    return i < 0;
  },
  history: () => read(KEY_HIST),
  pushHistory(id) {
    const list = read(KEY_HIST).filter((x) => x !== id);
    list.unshift(id);
    write(KEY_HIST, list.slice(0, HIST_MAX));
  },
  clearHistory: () => write(KEY_HIST, []),
  model() {
    try { return localStorage.getItem(KEY_MODEL); } catch { return null; }
  },
  setModel(id) {
    try { localStorage.setItem(KEY_MODEL, id); } catch { /* armazenamento indisponível */ }
  },
};
