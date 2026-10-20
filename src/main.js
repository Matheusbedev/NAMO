import './styles/base.css';
import './styles/anatomy.css';
import { MUSCLES } from './data/catalog.js';

const app = document.getElementById('app');
let cleanup = null;

const routes = {
  '/': () => {
    app.innerHTML = `
      <section class="page home">
        <h1>Anato da Mari</h1>
        <p>Atlas anatômico 3D do corpo inteiro. Explore cerca de 2.800 estruturas do corpo humano em 10 sistemas: gire, aproxime, ligue e desligue sistemas, filtre por lado, selecione estruturas e consulte as fichas anatômicas disponíveis. Funciona no computador e no celular.</p>
        <p><a class="btn" href="#/anatomia">Abrir o atlas</a></p>
        <h2>Cobertura do atlas</h2>
        <ul>
          <li>Modelo Z-Anatomy: ossos, dentes, músculos, fáscias, tecido conjuntivo, vasos, nervos, encéfalo, órgãos e sistema linfático.</li>
          <li>Modelo BodyParts3D, com 323 músculos e 203 ossos classificados por região, disponível no seletor "Modelo 3D".</li>
          <li>Todos os nomes em português, conforme a Terminologia Anatômica; o nome original em inglês aparece na ficha e também pode ser buscado.</li>
          <li>${MUSCLES.length} fichas educacionais curadas do membro superior, com origem, inserção, inervação e ação. Nas demais estruturas esses campos ainda não foram curados e ficam sinalizados.</li>
        </ul>
        <p class="muted">Material de apoio ao estudo. Confira sempre com a bibliografia da sua disciplina.</p>
      </section>`;
  },
  '/anatomia': async () => {
    document.body.classList.add('is-full');
    const { mountAnatomy } = await import('./anatomy/page.js'); // carrega three.js só aqui
    return mountAnatomy(app);
  },
  '/creditos': () => {
    app.innerHTML = `
      <section class="page">
        <h1>Créditos e licenças</h1>
        <h2>Modelos 3D</h2>
        <p><a href="https://dbarchive.biosciencedbc.jp/en/bodyparts3d/" target="_blank" rel="noopener">BodyParts3D</a> © Database Center for Life Science (DBCLS), licenciado sob <a href="https://creativecommons.org/licenses/by/4.0/deed.pt_BR" target="_blank" rel="noopener">CC BY 4.0</a> (os cabeçalhos dos arquivos originais citam CC BY-SA 2.1 JP). Malhas convertidas de OBJ para GLB e agrupadas por músculo.</p>
        <p>Atlas de 10 sistemas: camadas GLB do <a href="https://github.com/Grypa-JJ/anatomy-atlas-3d" target="_blank" rel="noopener">Anatomy Atlas 3D</a> v0.1.3 (Grypa-JJ), adaptadas de <a href="https://www.z-anatomy.com/" target="_blank" rel="noopener">Z-Anatomy</a> (<a href="https://creativecommons.org/licenses/by-sa/4.0/deed.pt_BR" target="_blank" rel="noopener">CC BY-SA 4.0</a>) e BodyParts3D © DBCLS (CC BY-SA 2.1 JP). Esses modelos e seus derivados permanecem sob licença CC BY-SA, com compartilhamento pela mesma licença.</p>
        <h2>Nomes em português</h2>
        <p>Os nomes das estruturas foram traduzidos do inglês das fontes para o português do Brasil seguindo a <em>Terminologia Anatômica</em> (edição brasileira da SBA/FIPAT) e o uso do Moore. Traduções com mais de uma forma em uso ou sem equivalente direto aparecem marcadas na ficha como "tradução marcada para revisão".</p>
        <h2>Conteúdo das fichas</h2>
        <p>Textos redigidos em português com base em: Moore, Dalley &amp; Agur, <em>Anatomia Orientada para a Clínica</em>; Standring, <em>Gray's Anatomy</em>; nomes em latim conforme a <em>Terminologia Anatomica</em> (FIPAT).</p>
        <h2>Bibliotecas</h2>
        <p><a href="https://threejs.org" target="_blank" rel="noopener">three.js</a> (MIT) e decodificador <a href="https://google.github.io/draco/" target="_blank" rel="noopener">Draco</a> (Apache-2.0).</p>
      </section>`;
  },
};

let renderId = 0;
async function render() {
  const id = ++renderId;
  const path = location.hash.replace(/^#/, '') || '/';
  const route = routes[path] ?? routes['/'];
  if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
  document.body.classList.remove('is-full');
  app.innerHTML = '';
  document.querySelectorAll('[data-route]').forEach((a) => {
    if (a.dataset.route === path) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  const pageTitle = { '/anatomia': 'Atlas 3D', '/creditos': 'Créditos' }[path];
  document.title = pageTitle ? `${pageTitle} · Anato da Mari` : 'Anato da Mari';
  const result = await route();
  // Se a pessoa trocou de página enquanto o atlas carregava, descarta esta montagem.
  if (id !== renderId) { if (typeof result === 'function') result(); return; }
  if (typeof result === 'function') cleanup = result;
}

window.addEventListener('hashchange', render);
render();
