# Anato da Mari — atlas anatômico 3D

Atlas web com dois modelos: Z-Anatomy (2.790 estruturas em 10 sistemas, padrão) e BodyParts3D 4.0 (**323 malhas musculares** e **203 ossos**, com regiões). Funciona no computador e no celular; no celular as camadas são baixadas só quando o sistema é ligado.

## Nomes em português

Todos os nomes vêm de `tools/i18n/pt-*.json` (inglês → português do Brasil, regras em `tools/i18n/REGRAS.md`, conforme a Terminologia Anatômica). Termos listados em `_duvidas` aparecem na ficha como "tradução marcada para revisão". Depois de editar um dicionário, rode `npm.cmd run data:pt` e `node tools/i18n/check_pt.mjs bones muscles ...` para validar.

## Iniciar

No Prompt de Comando, dentro da pasta do projeto:

```bat
iniciar.bat
```

Ou manualmente:

```bat
npm.cmd run data:pt
npm.cmd run check
npm.cmd run dev
```

Abra o endereço exibido pelo Vite e acrescente `#/anatomia`.

## Funcionalidades

- rotação, zoom e reposicionamento com mouse ou toque;
- vistas frontal, posterior e laterais;
- seleção individual das 323 malhas musculares;
- destaque, enquadramento, isolamento, ocultação e transparência;
- esqueleto completo com 203 ossos, que pode ser ocultado;
- filtros por nove regiões anatômicas e lado;
- busca em português e inglês;
- favoritos e histórico locais;
- 50 fichas curadas do membro superior com origem, inserção, inervação e ação;
- identificação FMA/BodyParts3D das demais estruturas, sem preencher campos clínicos não revisados.

## Cobertura educacional

## Atlas de 10 sistemas (Z-Anatomy)

O seletor "Modelo 3D" traz também o atlas completo do [Anatomy Atlas 3D](https://github.com/Grypa-JJ/anatomy-atlas-3d) v0.1.3: 2.790 estruturas em ossos, dentes, músculos, fáscias, tecido conjuntivo, vasos, nervos, encéfalo, órgãos e sistema linfático. É o modelo padrão.

Para reimportar, coloque as camadas `.glb` e os `all_*_labeled_v2.json` em `download/anatomy-atlas-3d-atlas-v0.1.3/_atlas_v2/dist/` (ou `_source/zanatomy/`) e rode `npm.cmd run data:zanatomy`. Os nomes vêm em inglês, como na fonte; as partes de músculos do membro superior são ligadas às fichas curadas. Modelos sob **CC BY-SA** (Z-Anatomy CC BY-SA 4.0; BodyParts3D CC BY-SA 2.1 JP): ao redistribuir, mantenha a atribuição e a mesma licença.

A cobertura **3D estrutural do modelo BodyParts3D é completa em relação aos arquivos disponíveis**. A cobertura textual detalhada ainda não é completa: as fichas do membro superior foram curadas; nas demais regiões, a interface mostra nome, nome original em inglês, região, lado, FMA e a indicação “ficha em curadoria”. Campos não curados ficam explicitamente como “Não informado”, em vez de receber conteúdo inventado.

O BodyParts3D não fornece origem, inserção, inervação, ação nem camadas pedagógicas. Esses dados precisam de curadoria por região com bibliografia anatômica. O atlas é material de apoio e não substitui a bibliografia da disciplina.

## Fonte e licença

Modelos: [BodyParts3D](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/) © Database Center for Life Science (DBCLS), disponibilizados atualmente sob CC BY 4.0. Os arquivos OBJ da versão 4.0 também contêm em seus cabeçalhos a atribuição histórica CC BY-SA 2.1 JP.

Fichas curadas: textos próprios baseados em Moore, Dalley & Agur, *Anatomia Orientada para a Clínica*; Standring, *Gray's Anatomy*; nomes latinos conforme a *Terminologia Anatomica* (FIPAT).
