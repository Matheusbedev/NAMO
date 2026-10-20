"""Gera um atlas musculoesquelético completo a partir do BodyParts3D 4.0.

Classificação autoritativa:
- FMA5022 (muscle organ): 323 elementos musculares
- FMA5018 (bone organ): 203 elementos ósseos
- raízes FMA regionais para cada músculo

Saída atual: _source/gerado/anatomia-completa.glb e .json (atlas experimental,
não usado pelo site). O par public/models/corpo-completo.* usado pelo site foi
gerado por uma versão anterior deste script; os nomes em português dele são
aplicados por tools/translate_bp3d.mjs.
As fichas curadas do membro superior são associadas pelo catálogo JS; as demais
estruturas permanecem identificadas por nome, região, lado e FMA, sem conteúdo
clínico inventado.
"""
import json, os, re, struct, subprocess, sys, zipfile
from collections import defaultdict

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SRC = os.path.join(ROOT, '_source')
# O site usa public/models/corpo-completo.* (já gerado). Este atlas experimental de
# 2.234 estruturas não é exibido; fica fora de public/ para não inflar o build.
OUT = os.path.join(ROOT, '_source', 'gerado')
REPORT = os.path.join(SRC, 'build_report.txt')
TABLE = os.path.join(SRC, 'isa_element_parts.txt')

REGION_ROOTS = [
    ('cabeca', 'FMA9616'), ('pescoco', 'FMA9617'),
    ('dorso', 'FMA22594'), ('torax', 'FMA9619'), ('abdome', 'FMA9620'),
    ('membro-superior', 'FMA9621'), ('membro-inferior', 'FMA9622'),
    ('perineo', 'FMA9623'), ('pelve', 'FMA19086'),
]
REGION_PT = {
    'cabeca': 'Cabeça', 'pescoco': 'Pescoço', 'dorso': 'Dorso e coluna',
    'torax': 'Tórax', 'abdome': 'Abdome', 'membro-superior': 'Membros superiores',
    'membro-inferior': 'Membros inferiores', 'perineo': 'Períneo', 'pelve': 'Pelve',
}

# Classificação FMA em ordem de precedência. As uniões são necessárias porque
# a distribuição IS-A não possui uma raiz única para todos os sistemas viscerais.
CATEGORIES = [
    ('artery', 'Artérias', ['FMA50720']),
    ('vein', 'Veias', ['FMA50723']),
    ('vascular', 'Outras estruturas vasculares', ['FMA50722']),
    ('nervous', 'Sistema nervoso', ['FMA55676','FMA83143','FMA78497','FMA65132','FMA11195','FMA61284','FMA5884']),
    ('respiratory', 'Sistema respiratório', ['FMA12224','FMA7394','FMA55108']),
    ('digestive', 'Sistema digestório', ['FMA7131','FMA7148','FMA14092','FMA14540','FMA14542','FMA7198','FMA7202','FMA71856','FMA9597','FMA9706','FMA14495','FMA14643','FMA14645','FMA7196','FMA54640']),
    ('urinary', 'Sistema urinário', ['FMA7203','FMA9704','FMA15900','FMA19667']),
    ('reproductive', 'Sistema reprodutor', ['FMA7210','FMA9600','FMA19618','FMA19617','FMA18247']),
    ('endocrine', 'Sistema endócrino e timo', ['FMA9604','FMA13889','FMA62033','FMA71193']),
    ('heart', 'Coração', ['FMA7232','FMA9464','FMA13256','FMA86212']),
    ('integument-cartilage', 'Pele e cartilagens', ['FMA7163','FMA55107']),
    ('muscle', 'Músculos', ['FMA5022']),
    ('bone', 'Ossos', ['FMA5018']),
]
CATEGORY_PT = {key: label for key, label, _ in CATEGORIES} | {'other': 'Outras estruturas'}
CATEGORY_COLORS = {
    'artery':'#d9474f','vein':'#3d73d9','vascular':'#9b59b6','nervous':'#f2d16b',
    'respiratory':'#65c7c1','digestive':'#c98a55','urinary':'#d6b4e8',
    'reproductive':'#e79ac2','endocrine':'#e2a64b','heart':'#c92f42',
    'integument-cartilage':'#83b98a','muscle':'#b8473f','bone':'#e6dcc6','other':'#9aa0a9',
}

# Traduções exatas mais frequentes; o restante usa vocabulário anatômico abaixo.
EXACT_PT = {
    'deltoid': 'Deltoide', 'trapezius': 'Trapézio', 'masseter': 'Masseter',
    'temporalis': 'Temporal', 'buccinator': 'Bucinador', 'platysma': 'Platisma',
    'diaphragm': 'Diafragma', 'sartorius': 'Sartório', 'gracilis': 'Grácil',
    'pectineus': 'Pectíneo', 'piriformis': 'Piriforme', 'soleus': 'Sóleo',
    'popliteus': 'Poplíteo', 'plantaris': 'Plantar', 'anconeus': 'Ancôneo',
    'brachialis': 'Braquial', 'brachioradialis': 'Braquiorradial',
    'coracobrachialis': 'Coracobraquial', 'supinator': 'Supinador',
    'mylohyoid': 'Milo-hióideo', 'geniohyoid': 'Gênio-hióideo',
    'stylohyoid': 'Estilo-hióideo', 'omohyoid': 'Omo-hióideo',
    'sternohyoid': 'Esterno-hióideo', 'thyrohyoid': 'Tireo-hióideo',
    'digastric': 'Digástrico', 'coccygeus': 'Coccígeo',
    'puborectalis': 'Puborretal', 'pubococcygeus': 'Pubococcígeo',
    'iliococcygeus': 'Iliococcígeo', 'cremaster': 'Cremáster',
}
WORD_PT = [
    (r'\bset of\b', 'conjunto de'), (r'\bmuscle\b', 'músculo'),
    (r'\bright\b', ''), (r'\bleft\b', ''),
    (r'\bfirst\b', 'primeiro'), (r'\bsecond\b', 'segundo'),
    (r'\bthird\b', 'terceiro'), (r'\bfourth\b', 'quarto'),
    (r'\babductor\b', 'abdutor'), (r'\badductor\b', 'adutor'),
    (r'\bflexor\b', 'flexor'), (r'\bextensor\b', 'extensor'),
    (r'\bpronator\b', 'pronador'), (r'\boblique\b', 'oblíquo'),
    (r'\btransverse\b', 'transverso'), (r'\brectus\b', 'reto'),
    (r'\bexternal\b', 'externo'), (r'\binternal\b', 'interno'),
    (r'\binnermost\b', 'íntimo'), (r'\bsuperficial\b', 'superficial'),
    (r'\bdeep\b', 'profundo'), (r'\bsuperior\b', 'superior'),
    (r'\binferior\b', 'inferior'), (r'\banterior\b', 'anterior'),
    (r'\bposterior\b', 'posterior'), (r'\blateral\b', 'lateral'),
    (r'\bmedial\b', 'medial'), (r'\bmajor\b', 'maior'), (r'\bminor\b', 'menor'),
    (r'\blongus\b', 'longo'), (r'\bbrevis\b', 'curto'),
    (r'\bmaximus\b', 'máximo'), (r'\bmedius\b', 'médio'), (r'\bminimus\b', 'mínimo'),
    (r'\bbiceps\b', 'bíceps'), (r'\btriceps\b', 'tríceps'),
    (r'\bquadriceps\b', 'quadríceps'), (r'\bgluteus\b', 'glúteo'),
    (r'\bgastrocnemius\b', 'gastrocnêmio'), (r'\btibialis\b', 'tibial'),
    (r'\bfibularis\b', 'fibular'), (r'\bperoneus\b', 'fibular'),
    (r'\binterosseous\b', 'interósseo'), (r'\binterossei\b', 'interósseos'),
    (r'\blumbrical\b', 'lumbrical'), (r'\blumbricals\b', 'lumbricais'),
    (r'\bdigitorum\b', 'dos dedos'), (r'\bdigiti minimi\b', 'do dedo mínimo'),
    (r'\bpollicis\b', 'do polegar'), (r'\bhallucis\b', 'do hálux'),
    (r'\bcarpi\b', 'do carpo'), (r'\bulnaris\b', 'ulnar'), (r'\bradialis\b', 'radial'),
    (r'\bfemoris\b', 'da coxa'), (r'\bcapitis\b', 'da cabeça'),
    (r'\bcervicis\b', 'do pescoço'), (r'\bthoracis\b', 'do tórax'),
    (r'\blumborum\b', 'lombar'), (r'\babdominis\b', 'do abdome'),
    (r'\bscapulae\b', 'da escápula'), (r'\bhyoid\b', 'hióideo'),
    (r'\bhead of\b', 'cabeça do'), (r'\bpart of\b', 'parte do'),
    (r'\bof hand\b', 'da mão'), (r'\bof foot\b', 'do pé'),
    (r'\barteries\b', 'artérias'), (r'\bartery\b', 'artéria'),
    (r'\bveins\b', 'veias'), (r'\bvein\b', 'veia'), (r'\bnerve\b', 'nervo'),
    (r'\bbrain\b', 'encéfalo'), (r'\bheart\b', 'coração'), (r'\bkidney\b', 'rim'),
    (r'\bureter\b', 'ureter'), (r'\bbladder\b', 'bexiga'), (r'\bstomach\b', 'estômago'),
    (r'\besophagus\b', 'esôfago'), (r'\bintestine\b', 'intestino'), (r'\bcolon\b', 'cólon'),
    (r'\bliver\b', 'fígado'), (r'\bpancreas\b', 'pâncreas'), (r'\bspleen\b', 'baço'),
    (r'\bbronchus\b', 'brônquio'), (r'\btrachea\b', 'traqueia'),
    (r'\bcartilage\b', 'cartilagem'), (r'\bskin\b', 'pele'), (r'\btooth\b', 'dente'),
    (r'\bligament\b', 'ligamento'), (r'\btendon\b', 'tendão'),
    (r'\bgland\b', 'glândula'), (r'\bcavity\b', 'cavidade'),
]

CURATED_ALIASES = [
    ('dorsal interossei of hand', 'interosseos-dorsais'),
    ('palmar interossei of hand', 'interosseos-palmares'),
    ('lumbrical of hand', 'lumbricais'), ('adductor pollicis', 'adutor-do-polegar'),
    ('deltoid', 'deltoide'), ('trapezius', 'trapezio'),
    ('pectoralis major', 'peitoral-maior'), ('pectoralis minor', 'peitoral-menor'),
    ('serratus anterior', 'serratil-anterior'), ('subclavius', 'subclavio'),
    ('levator scapulae', 'levantador-da-escapula'), ('rhomboid major', 'romboide-maior'),
    ('rhomboid minor', 'romboide-menor'), ('supraspinatus', 'supraespinal'),
    ('infraspinatus', 'infraespinal'), ('teres major', 'redondo-maior'),
    ('teres minor', 'redondo-menor'), ('subscapularis', 'subescapular'),
    ('biceps brachii', 'biceps-braquial'), ('triceps brachii', 'triceps-braquial'),
    ('coracobrachialis', 'coracobraquial'), ('brachialis', 'braquial'),
    ('anconeus', 'ancone'), ('pronator teres', 'pronador-redondo'),
    ('pronator quadratus', 'pronador-quadrado'), ('brachioradialis', 'braquiorradial'),
    ('flexor carpi radialis', 'flexor-radial-do-carpo'), ('palmaris longus', 'palmar-longo'),
    ('flexor carpi ulnaris', 'flexor-ulnar-do-carpo'),
    ('flexor digitorum superficialis', 'flexor-superficial-dos-dedos'),
    ('flexor digitorum profundus', 'flexor-profundo-dos-dedos'),
    ('flexor pollicis longus', 'flexor-longo-do-polegar'), ('supinator', 'supinador'),
    ('extensor carpi radialis longus', 'extensor-radial-longo-do-carpo'),
    ('extensor carpi radialis brevis', 'extensor-radial-curto-do-carpo'),
    ('extensor digitorum', 'extensor-dos-dedos'), ('extensor digiti minimi', 'extensor-do-dedo-minimo'),
    ('extensor carpi ulnaris', 'extensor-ulnar-do-carpo'),
    ('abductor pollicis longus', 'abdutor-longo-do-polegar'),
    ('extensor pollicis brevis', 'extensor-curto-do-polegar'),
    ('extensor pollicis longus', 'extensor-longo-do-polegar'),
    ('extensor indicis', 'extensor-do-indicador'),
    ('abductor pollicis brevis', 'abdutor-curto-do-polegar'),
    ('flexor pollicis brevis', 'flexor-curto-do-polegar'),
    ('opponens pollicis', 'oponente-do-polegar'),
    ('abductor digiti minimi of hand', 'abdutor-do-dedo-minimo'),
    ('flexor digiti minimi brevis of hand', 'flexor-curto-do-dedo-minimo'),
    ('opponens digiti minimi of hand', 'oponente-do-dedo-minimo'),
]


class Source:
    def __init__(self):
        self.files, self.archive = {}, None
        candidates = []
        for d, _, names in os.walk(SRC):
            objs = [n for n in names if n.lower().endswith('.obj')]
            if len(objs) > 300:
                candidates.append((len(objs), d, objs))
        if candidates:
            _, d, names = max(candidates)
            self.files = {os.path.splitext(n)[0]: os.path.join(d, n) for n in names}
            self.desc = f'{d} ({len(self.files)} OBJ)'
            return
        for name in ('isa_BP3D_4.0_obj_99.zip', 'partof_BP3D_4.0_obj_99.zip'):
            p = os.path.join(SRC, name)
            if os.path.isfile(p):
                self.archive = zipfile.ZipFile(p)
                self.files = {os.path.splitext(os.path.basename(n))[0]: n for n in self.archive.namelist() if n.endswith('.obj')}
                self.desc = f'{name} ({len(self.files)} OBJ)'
                return
        sys.exit('Fonte BodyParts3D não encontrada em _source/.')

    def read(self, fid, limit=None):
        p = self.files[fid]
        if self.archive:
            with self.archive.open(p) as f: return f.read(limit) if limit else f.read()
        with open(p, 'rb') as f: return f.read(limit) if limit else f.read()


def parse_table():
    concepts, names = defaultdict(set), defaultdict(set)
    with open(TABLE, encoding='utf-8') as f:
        for line in f:
            p = line.rstrip('\n').split('\t')
            if len(p) >= 3:
                concepts[p[0]].add(p[2]); names[p[2]].add((p[0], p[1]))
    return concepts, names


def parse_parts():
    result = {}
    path = os.path.join(SRC, 'isa_parts_list_e.txt')
    with open(path, encoding='utf-8') as f:
        next(f, None)
        for line in f:
            p = line.rstrip('\n').split('\t')
            if len(p) >= 3: result[p[0]] = {'representationId': p[1], 'conceptName': p[2]}
    return result


def parse_header(src, fid):
    text = src.read(fid, 2400).decode('utf-8', 'replace')
    def get(label):
        m = re.search(rf'^# {re.escape(label)}\s*:\s*(.+)$', text, re.M | re.I)
        return m.group(1).strip() if m else None
    return {'name': get('English name') or fid, 'fma': get('Concept ID')}


def side_for(name, concept_rows):
    pool = ' | '.join([name] + [n for _, n in concept_rows]).lower()
    has_l, has_r = bool(re.search(r'\bleft\b', pool)), bool(re.search(r'\bright\b', pool))
    if has_l and not has_r: return 'L'
    if has_r and not has_l: return 'R'
    return None


def base_name(name):
    return re.sub(r'\s+', ' ', re.sub(r'\b(left|right)\b', '', name, flags=re.I)).strip()


def slug(value):
    s = value.lower()
    s = re.sub(r'[^a-z0-9]+', '-', s).strip('-')
    return s or 'estrutura'


def translate(name):
    base = base_name(name).lower()
    if base in EXACT_PT: return EXACT_PT[base]
    out = base
    for pattern, replacement in WORD_PT:
        out = re.sub(pattern, replacement, out)
    out = re.sub(r'\s+', ' ', out).strip(' ,')
    return out[:1].upper() + out[1:] if out else name


def curated_id(name, region, fma_map):
    if region != 'membro-superior': return None
    n = base_name(name).lower()
    if n in fma_map: return fma_map[n]
    for term, ident in CURATED_ALIASES:
        if term in n: return ident
    return None


def parse_obj(data):
    verts, faces = [], []
    for raw in data.decode('utf-8', 'replace').splitlines():
        if raw.startswith('v '):
            p = raw.split()
            if len(p) >= 4: verts.append((float(p[1]), float(p[2]), float(p[3])))
        elif raw.startswith('f '):
            ids = [int(x.split('/')[0]) for x in raw.split()[1:]]
            ids = [i - 1 if i > 0 else len(verts) + i for i in ids]
            for i in range(1, len(ids) - 1): faces.append((ids[0], ids[i], ids[i + 1]))
    return verts, faces


def write_glb(path, meshes):
    chunks, views, accessors, glmeshes, nodes, offset = [], [], [], [], [], 0
    def view(blob, target):
        nonlocal offset
        pad = (-len(blob)) % 4
        views.append({'buffer': 0, 'byteOffset': offset, 'byteLength': len(blob), 'target': target})
        chunks.append(blob + b'\0' * pad); offset += len(blob) + pad
        return len(views) - 1
    for key, verts, faces in meshes:
        if not verts or not faces: continue
        xs, ys, zs = zip(*verts)
        pv = view(struct.pack(f'<{len(verts)*3}f', *(c for v in verts for c in v)), 34962)
        accessors.append({'bufferView': pv, 'componentType': 5126, 'count': len(verts), 'type': 'VEC3',
                          'min': [min(xs), min(ys), min(zs)], 'max': [max(xs), max(ys), max(zs)]})
        flat = [i for face in faces for i in face]
        code, ctype = ('H', 5123) if len(verts) < 65536 else ('I', 5125)
        iv = view(struct.pack(f'<{len(flat)}{code}', *flat), 34963)
        accessors.append({'bufferView': iv, 'componentType': ctype, 'count': len(flat), 'type': 'SCALAR'})
        glmeshes.append({'name': key, 'primitives': [{'attributes': {'POSITION': len(accessors)-2}, 'indices': len(accessors)-1}]})
        nodes.append({'name': key, 'mesh': len(glmeshes)-1})
    binary = b''.join(chunks)
    doc = {'asset': {'version': '2.0', 'generator': 'REA Anatomia', 'copyright': 'BodyParts3D © DBCLS, CC BY 4.0'},
           'scene': 0, 'scenes': [{'nodes': list(range(len(nodes)))}], 'nodes': nodes,
           'meshes': glmeshes, 'accessors': accessors, 'bufferViews': views,
           'buffers': [{'byteLength': len(binary)}]}
    js = json.dumps(doc, separators=(',', ':')).encode(); js += b' ' * ((-len(js)) % 4)
    with open(path, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, 12+8+len(js)+8+len(binary)))
        f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
        f.write(struct.pack('<II', len(binary), 0x004E4942)); f.write(binary)


def main():
    src = Source(); concepts, concept_rows = parse_table(); parts = parse_parts()
    all_ids = set(src.files)
    canonical = concepts['FMA62955'] & all_ids
    assert len(all_ids) == 2234, f'esperado 2234 OBJ; encontrado {len(all_ids)}'
    assert canonical == all_ids, f'{len(all_ids-canonical)} OBJ fora de FMA62955'

    category_sets = {}
    for key, _, roots in CATEGORIES:
        category_sets[key] = set().union(*(concepts[root] for root in roots)) & all_ids
    assigned, primary, matches_by_fid = set(), {}, {}
    for fid in all_ids:
        matches = [key for key, _, _ in CATEGORIES if fid in category_sets[key]]
        matches_by_fid[fid] = matches
        choice = next((key for key, _, _ in CATEGORIES if key in matches), 'other')
        primary[fid] = choice; assigned.add(fid)

    region_sets = {region: concepts[fma] for region, fma in REGION_ROOTS}
    fma_map = json.loads(subprocess.run(['node', os.path.join(ROOT, 'tools', 'dump_fma.mjs')],
                         capture_output=True, text=True, cwd=ROOT, check=True).stdout)
    headers = {fid: parse_header(src, fid) for fid in all_ids}
    structures, meshes = [], []

    for fid in sorted(all_ids):
        header = headers[fid]; name = header['name']; rows = concept_rows[fid]
        category = primary[fid]
        regions = [r for r, ids in region_sets.items() if fid in ids] if category == 'muscle' else []
        region = regions[0] if regions else None
        curated = curated_id(name, region, fma_map) if category == 'muscle' else None
        ficha = curated or f"{category}-{slug(base_name(name))}"
        key = f'structure:{fid}'
        verts, faces = parse_obj(src.read(fid)); meshes.append((key, verts, faces))
        meta = parts.get(header['fma'], {})
        structures.append({'key': key, 'kind': category, 'category': category,
            'categoryMatches': matches_by_fid[fid], 'side': side_for(name, rows),
            'region': region, 'fichaId': ficha, 'curated': bool(curated),
            'nameEn': base_name(name), 'namePt': translate(name), 'latin': None,
            'fmaId': header['fma'], 'representationId': meta.get('representationId'),
            'sourceFile': fid, 'classificationMethod': 'fma-isa'})

    os.makedirs(OUT, exist_ok=True)
    write_glb(os.path.join(OUT, 'anatomia-completa.glb'), meshes)
    assigned_counts = {key: sum(primary[fid] == key for fid in all_ids) for key, _, _ in CATEGORIES}
    assigned_counts['other'] = sum(primary[fid] == 'other' for fid in all_ids)
    raw_counts = {key: len(category_sets[key]) for key, _, _ in CATEGORIES}
    muscle_regions = {r: len(ids & category_sets['muscle']) for r, ids in region_sets.items()}
    category_defs = [{'id': key, 'label': label, 'color': CATEGORY_COLORS[key],
                      'roots': roots, 'rawCount': raw_counts[key], 'count': assigned_counts[key]}
                     for key, label, roots in CATEGORIES]
    category_defs.append({'id':'other','label':CATEGORY_PT['other'],'color':CATEGORY_COLORS['other'],
                          'roots':[],'rawCount':assigned_counts['other'],'count':assigned_counts['other']})
    manifest = {
        'schemaVersion': 2,
        'source': {'name':'BodyParts3D 4.0','license':'CC BY 4.0','objectCount':len(all_ids)},
        'units':'mm','up':'Z',
        'counts': {'total':len(structures),'categories':assigned_counts,'muscleRegions':muscle_regions},
        'classification': {'method':'FMA IS-A, first-match precedence','precedence':[c[0] for c in CATEGORIES]+['other']},
        'categories': category_defs,
        'regions':[{'id':r,'label':REGION_PT[r],'count':muscle_regions[r]} for r,_ in REGION_ROOTS],
        'structures': structures,
        'knownSourceGaps': [
          'Sem malhas linfáticas identificáveis nesta distribuição',
          'Sem pulmões inteiros; há árvore traqueobrônquica',
          'Sem medula espinal inteira; há canal central',
          'Sem tireoide, paratireoides, ovários, útero e vagina'
        ]
    }
    with open(os.path.join(OUT, 'anatomia-completa.json'), 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, separators=(',', ':'))
    with open(REPORT, 'w', encoding='utf-8') as f:
        f.write(f'fonte: {src.desc}\nTOTAL: {len(structures)}/2234\n')
        for key, label, _ in CATEGORIES:
            f.write(f'{label}: atribuído={assigned_counts[key]} bruto={raw_counts[key]}\n')
        f.write(f'Outras estruturas: {assigned_counts["other"]}\nSEM CLASSIFICAÇÃO: 0\n')
        f.write('Regiões musculares: '+', '.join(f'{r}={n}' for r,n in muscle_regions.items())+'\n')
    assert len(structures) == 2234 and len({s['sourceFile'] for s in structures}) == 2234
    assert assigned_counts['artery'] == 562 and assigned_counts['vein'] == 342
    assert assigned_counts['muscle'] == 323 and assigned_counts['bone'] == 203
    print(f'OK: atlas anatômico — {len(structures)} estruturas 3D')
    print(', '.join(f'{CATEGORY_PT[k]}={v}' for k,v in assigned_counts.items()))

if __name__ == '__main__': main()
