import fs from 'node:fs';

function check(condition, message) {
  if (!condition) throw new Error(message);
}

/** Lê o cabeçalho e o JSON de um GLB, validando a integridade binária. */
function readGlb(url, label) {
  const glb = fs.readFileSync(url);
  check(glb.readUInt32LE(0) === 0x46546c67, `${label}: magic inválido`);
  check(glb.readUInt32LE(4) === 2, `${label}: versão diferente de 2`);
  check(glb.readUInt32LE(8) === glb.length, `${label}: tamanho declarado divergente`);
  const jsonLength = glb.readUInt32LE(12);
  return { size: glb.length, gltf: JSON.parse(glb.subarray(20, 20 + jsonLength).toString('utf8')) };
}

// ── BodyParts3D (músculos e ossos) ──
{
  const manifest = JSON.parse(fs.readFileSync(new URL('../public/models/corpo-completo.json', import.meta.url), 'utf8'));
  const { size, gltf } = readGlb(new URL('../public/models/corpo-completo.glb', import.meta.url), 'corpo-completo.glb');
  const manifestKeys = new Set(manifest.structures.map((s) => s.key));
  const glbKeys = new Set(gltf.nodes.map((n) => n.name));
  const muscles = manifest.structures.filter((s) => s.kind === 'muscle');
  const bones = manifest.structures.filter((s) => s.kind === 'bone');
  check(muscles.length === 323, `Esperado 323 músculos; recebido ${muscles.length}`);
  check(bones.length === 203, `Esperado 203 ossos; recebido ${bones.length}`);
  check(manifestKeys.size === 526, 'Manifesto contém chaves duplicadas');
  check(glbKeys.size === 526, 'GLB contém nomes de nós duplicados');
  check([...manifestKeys].every((key) => glbKeys.has(key)), 'GLB e manifesto possuem chaves diferentes');
  check(muscles.every((s) => s.fichaId && s.region && s.nameEn && s.namePt), 'Músculo sem identificação obrigatória');
  check(manifest.structures.every((s) => s.nameEn && !s.nameEn.startsWith('#')), 'BodyParts3D: estrutura com nome inválido (rode tools/translate_bp3d.mjs)');
  check(manifest.structures.every((s) => s.namePt), 'BodyParts3D: estrutura sem nome em português');
  console.log(`OK BodyParts3D: ${muscles.length} músculos, ${bones.length} ossos, ${(size / 1024 / 1024).toFixed(1)} MB`);
}

// ── Z-Anatomy (10 sistemas) ──
{
  const base = new URL('../public/models/zanatomy/', import.meta.url);
  const manifest = JSON.parse(fs.readFileSync(new URL('manifest.json', base), 'utf8'));
  check(manifest.layers?.length === 10, `Z-Anatomy: esperadas 10 camadas; recebidas ${manifest.layers?.length}`);
  const keys = new Set(manifest.structures.map((s) => s.key));
  check(keys.size === manifest.structures.length, 'Z-Anatomy: chaves duplicadas no manifesto');
  let bytes = 0;
  for (const layer of manifest.layers) {
    const { size, gltf } = readGlb(new URL(`${layer.id}.glb`, base), `${layer.id}.glb`);
    bytes += size;
    check(size === layer.bytes, `${layer.id}.glb: tamanho diferente do manifesto`);
    check(gltf.extensionsUsed?.includes('KHR_draco_mesh_compression'), `${layer.id}.glb: compressão Draco esperada`);
    const nodes = new Set(gltf.nodes.map((n) => n.name));
    const own = manifest.structures.filter((s) => s.file === layer.id);
    check(own.length === layer.count, `${layer.id}: contagem divergente`);
    check(own.every((s) => nodes.has(s.node)), `${layer.id}: estrutura sem nó correspondente no GLB`);
    check(own.every((s) => s.kind === layer.kind && s.fichaId && s.nameEn), `${layer.id}: estrutura sem identificação obrigatória`);
    check(own.every((s) => s.namePt), `${layer.id}: estrutura sem nome em português`);
  }
  for (const f of ['draco_decoder.js', 'draco_decoder.wasm', 'draco_wasm_wrapper.js']) {
    check(fs.existsSync(new URL(`../public/draco/${f}`, import.meta.url)), `Decodificador Draco ausente: public/draco/${f}`);
  }
  console.log(`OK Z-Anatomy: ${manifest.structures.length} estruturas em ${manifest.layers.length} camadas, ${(bytes / 1024 / 1024).toFixed(1)} MB`);
}
