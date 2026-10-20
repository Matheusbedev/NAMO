"""Lista o nome (cabeçalho) de cada OBJ do zip em _source/names.txt."""
import os, re, zipfile
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
z = zipfile.ZipFile(os.path.join(ROOT, '_source', 'partof_BP3D_4.0_obj_99.zip'))
rows = []
for n in z.namelist():
    if not n.endswith('.obj'):
        continue
    with z.open(n) as fh:
        head = fh.read(2000).decode('utf-8', 'replace')
    m = re.search(r'# English name\s*:\s*(.+)', head)
    rows.append(f"{os.path.basename(n)[:-4]}\t{(m.group(1).strip() if m else '?')}")
with open(os.path.join(ROOT, '_source', 'names.txt'), 'w', encoding='utf-8') as f:
    f.write('\n'.join(sorted(rows, key=lambda r: r.split('\t')[1])))
