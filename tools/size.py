import os
d = os.path.join(os.path.dirname(__file__), '..', '_source')
with open(os.path.join(d, 'size.txt'), 'w') as f:
    for n in os.listdir(d):
        if 'isa_BP3D' in n:
            f.write(f'{n} {os.path.getsize(os.path.join(d, n))}\n')
