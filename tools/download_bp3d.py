"""Baixa os dados do BodyParts3D (CC BY 4.0, DBCLS) para _source/.

O pacote IS-A (136 MB) contém as malhas de todos os músculos do membro
superior; o PART-OF (62 MB) não inclui deltoide, bíceps, antebraço e mão.
"""
import os
import urllib.request

BASE = "https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/"
FILES = [
    "partof_element_parts.txt",
    "isa_element_parts.txt",
    "isa_parts_list_e.txt",
    "isa_BP3D_4.0_obj_99.zip",
]
ROOT = os.path.join(os.path.dirname(__file__), "..", "_source")
os.makedirs(ROOT, exist_ok=True)

for name in FILES:
    dest = os.path.join(ROOT, name)
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        print("ok (cache)", name, flush=True)
        continue
    print("baixando", name, flush=True)
    urllib.request.urlretrieve(BASE + name, dest + ".part")
    os.replace(dest + ".part", dest)
    print("ok", name, os.path.getsize(dest), flush=True)
print("FIM", flush=True)
