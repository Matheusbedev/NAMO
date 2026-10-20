# Regras de tradução dos nomes anatômicos (inglês → português do Brasil)

Referência: Terminologia Anatômica (SBA, edição brasileira da FIPAT/TA) e o uso do
Moore/Dalley (Anatomia Orientada para a Clínica, ed. brasileira) e do Netter em português.

1. **Use o termo oficial em português do Brasil**, não uma tradução literal palavra a palavra.
   - "Rectus femoris muscle" → "Músculo reto femoral" (não "reto da coxa")
   - "Greater tubercle" → "Tubérculo maior"; "Head of femur" → "Cabeça do fêmur"
   - "Common carotid artery" → "Artéria carótida comum"
   - "Great saphenous vein" → "Veia safena magna"; "Small saphenous vein" → "Veia safena parva"
   - "Lymph node / node / nodes" → "Linfonodo / linfonodos" (ex.: "Apical axillary nodes" → "Linfonodos axilares apicais")
   - "Vertebra" → "Vértebra"; "Atlas (C1)" → "Atlas (C1)"
2. **Mantenha o prefixo da classe** quando o inglês tiver: "muscle" → "Músculo ...", "artery" → "Artéria ...",
   "vein" → "Veia ...", "nerve" → "Nervo ...", "ligament" → "Ligamento ...". Se o inglês não tiver
   o prefixo (ex.: "Deltoid", "Platysma"), não acrescente.
3. **Ortografia brasileira atual**, com acentos: "esternocleidomastóideo", "fêmur", "úmero", "tíbia",
   "glúteo", "oblíquo", "Íleo", "hióideo", "estiloide" e "deltoide" (sem acento, pelo Acordo).
   Palavras compostas: "anterolateral", "posteromedial", "inferolateral" (juntas, sem hífen).
4. **Maiúscula só na primeira letra** (e em siglas/nomes próprios): "Músculo bíceps braquial",
   "Ducto de Wirsung" só se o inglês usar epônimo. Números romanos e códigos ficam iguais:
   "(BVIII)", "(VI)", "C1", "T12", "L5", "S1".
5. **Lados** (left/right) normalmente não aparecem no nome. Se aparecerem como parte do nome
   ("of left lung", "of right ventricle"), traduza: "do pulmão esquerdo", "do ventrículo direito".
6. **Dedos**: "first/second/third/fourth/fifth finger of hand" → "1º/2º/3º/4º/5º dedo da mão";
   "of foot" → "do pé"; "first finger of foot" → "hálux" quando for o termo usual
   ("Distal phalanx of first finger of foot" → "Falange distal do hálux";
   "Distal phalanx of fifth finger of hand" → "Falange distal do 5º dedo da mão").
   Polegar: "first finger of hand" → "polegar".
7. **Plural** quando o inglês está no plural ("muscles", "nodes", "branches").
8. **Asteriscos, parênteses de lateralidade e espaços extras** já foram removidos; não os inclua.
9. **Não invente**. Se não tiver certeza do termo oficial, ainda traduza da forma mais fiel,
   mas registre a chave em `"_duvidas"` (lista de nomes ingleses) no fim do JSON.
10. **Não traduza o que já é latim consagrado no uso brasileiro** quando o termo oficial é latino
    (ex.: "Corpus callosum" → "Corpo caloso" sim; "Vermis" → "Verme"; "Hippocampus" → "Hipocampo").

Formato do arquivo de saída `pt-<camada>.json`:

```json
{
  "Abdominal aorta": "Parte abdominal da aorta",
  "Clavicle": "Clavícula",
  "_duvidas": ["Nome inglês com dúvida"]
}
```

Todas as linhas do arquivo `_<camada>.txt` precisam virar uma chave, exatamente como escritas.
