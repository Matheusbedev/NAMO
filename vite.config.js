import { defineConfig } from 'vite';

// base '/NAMO/' porque o site é servido em usuario.github.io/NAMO/ pelo GitHub Pages.
// Em desenvolvimento (npm run dev) o base continua '/', para abrir em localhost:5173/.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/NAMO/' : '/',
  build: {
    chunkSizeWarningLimit: 1500, // o three.js forma um chunk grande e esperado
  },
}));
