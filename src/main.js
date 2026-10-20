import './styles/base.css';
import './styles/anatomy.css';

const app = document.getElementById('app');
let cleanup = null;

async function render() {
  if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
  // O atlas é a única página: ocupa a tela inteira e carrega o three.js sob demanda.
  document.body.classList.add('is-full');
  app.innerHTML = '';
  document.title = 'Anato da Mari — Atlas anatômico 3D';
  const { mountAnatomy } = await import('./anatomy/page.js');
  cleanup = mountAnatomy(app);
}

render();
