// Valida um dicionário de tradução: node tools/i18n/check_pt.mjs <camada> [<camada> ...]
// Confere se toda linha de _<camada>.txt tem tradução em pt-<camada>.json e aponta
// palavras inglesas que sobraram nas traduções.
import fs from 'node:fs';

const EN_LEFTOVER = /\b(of|the|and|muscle|muscles|artery|arteries|vein|veins|nerve|nerves|bone|bones|branch|branches|node|nodes|left|right|superior|inferior|anterior|posterior)\b(?![\p{L}])/iu;
const PT_OK = /\b(superior|inferior|anterior|posterior)\b/i; // existem em português também
let bad = 0;
for (const layer of process.argv.slice(2)) {
  const names = fs.readFileSync(`tools/i18n/_${layer}.txt`, 'utf8').split(/\r?\n/).filter(Boolean);
  let dict;
  try { dict = JSON.parse(fs.readFileSync(`tools/i18n/pt-${layer}.json`, 'utf8')); } catch (e) { console.log(`${layer}: JSON inválido ou ausente (${e.message})`); bad++; continue; }
  const missing = names.filter((n) => typeof dict[n] !== 'string' || !dict[n].trim());
  const extra = Object.keys(dict).filter((k) => k !== '_duvidas' && !names.includes(k));
  const leftovers = names.filter((n) => typeof dict[n] === 'string')
    .filter((n) => { const v = dict[n].replace(PT_OK, ''); return EN_LEFTOVER.test(v) && !/\b(superior|inferior|anterior|posterior)\b/i.test(v.match(EN_LEFTOVER)?.[0] ?? ''); })
    .map((n) => `${n} => ${dict[n]}`);
  const same = names.filter((n) => dict[n] === n && /\s/.test(n));
  console.log(`${layer}: ${names.length} nomes, faltando ${missing.length}, extras ${extra.length}, inglês restante ${leftovers.length}, idênticos ${same.length}, dúvidas ${(dict._duvidas ?? []).length}`);
  for (const x of missing.slice(0, 30)) console.log(`  FALTA: ${x}`);
  for (const x of extra.slice(0, 10)) console.log(`  EXTRA: ${x}`);
  for (const x of leftovers.slice(0, 30)) console.log(`  INGLÊS?: ${x}`);
  for (const x of same.slice(0, 20)) console.log(`  IGUAL: ${x}`);
  if (missing.length || extra.length) bad++;
}
process.exit(bad ? 1 : 0);
