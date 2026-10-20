import os
root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
out = []
for base in (root, os.path.expanduser('~/Downloads')):
    for d, dirs, files in os.walk(base):
        if 'node_modules' in d:
            continue
        objs = [f for f in files if f.endswith('.obj')]
        zips = [f for f in files if f.startswith('isa_BP3D')]
        if objs or zips:
            out.append(f'{d}\t{len(objs)} obj\t{zips}')
        if d.count(os.sep) - base.count(os.sep) > 3:
            dirs[:] = []
with open(os.path.join(root, '_source', 'found.txt'), 'w', encoding='utf-8') as f:
    f.write('\n'.join(out) or 'NADA')
