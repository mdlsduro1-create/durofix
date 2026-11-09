#!/usr/bin/env python3
"""
Léxico · Fase 1 — Extracción y clasificación de palabras candidatas.

Encuentra, con datos abiertos, las palabras del español que son «cultas pero
útiles»: poco frecuentes en el habla diaria, vivas en la escritura, sin marca
de arcaísmo, regionalismo estrecho ni tecnicismo, y con un equivalente común
al que pueden sustituir («en vez de *claro*, di *diáfano*»).

Fuentes (descargar en DATA_DIR):
  es-extract.jsonl.gz  Wikcionario en español procesado por kaikki.org
                       (https://kaikki.org/dictionary/rawdata.html) · CC BY-SA 4.0
  es_full.txt          Frecuencias de subtítulos (OpenSubtitles 2018, hermitdave/FrequencyWords)
  news-words.txt       Frecuencias de prensa (Leipzig Corpora, spa_news_2023_1M)
  + librería `wordfreq` (frecuencia general multi-fuente)

Uso:
  python3 candidatos.py DATA_DIR OUT_DIR

Salida:
  OUT_DIR/candidatos.csv   todas las candidatas con métricas y nivel (A/B/C)
  OUT_DIR/informe.json     embudo de filtrado, calibración y validación
"""
import csv, gzip, json, math, os, pickle, re, sys, unicodedata
from collections import defaultdict
from wordfreq import word_frequency, zipf_frequency

DATA, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)

# Conjunto de referencia: las 36 palabras elegidas a mano para la app.
# Sirven para calibrar la franja de frecuencia y medir cuántas recupera el filtro.
GOLD = ("diáfano ecuánime soslayar inocuo paliar exiguo elocuente perentorio dilucidar acérrimo "
        "prolijo nimio sucinto vehemente taciturno efímero inexorable ubicuo idóneo procrastinar "
        "ínfulas lacónico mesurado obcecado pusilánime recóndito sagaz tácito vetusto zozobra "
        "subsanar menoscabar esgrimir desidia parsimonia ahínco").split()

POS_OK = {'adj', 'verb', 'noun', 'adv'}
# Marcas que descartan una acepción: desuso, rareza, registro bajo, regionalismo.
BAD_TAGS = {'outdated', 'obsolete', 'rare', 'vulgar', 'slang', 'Lunfardo', 'childish', 'no-gloss',
            'form-of', 'derogatory', 'euphemism', 'jocular', 'dated', 'archaic', 'colloquial', 'neologism'}
REGION_TAGS = {'Chile', 'Argentina', 'Mexico', 'Venezuela', 'Spain', 'Colombia', 'Uruguay', 'Peru',
               'Río-de-la-Plata', 'Honduras', 'Bolivia', 'Cuba', 'El-Salvador', 'Ecuador', 'Nicaragua',
               'America', 'Puerto-Rico', 'Costa-Rica', 'Guatemala', 'Paraguay', 'Dominican-Republic',
               'Andalusia', 'Panama', 'Central-America', 'Aragon', 'Chiloé', 'Salamanca', 'South-America',
               'Canaries', 'Asturias', 'South-Cone', 'León', 'Caribbean', 'Murcia', 'Cantabria', 'Navarra',
               'US', 'Philippines', 'Álava', 'Extremadura', 'Southern-Chile', 'Galicia', 'Castile', 'Yucatán',
               'Equatorial-Guinea', 'Northern-Mexico', 'Andes', 'Rioja', 'Valencia', 'Basque-Country'}
# Ámbitos especializados: una acepción con estos temas no cuenta como «uso general».
TECH_TOPICS = {'medicine', 'nautical', 'religion', 'botany', 'history', 'cities', 'architecture', 'anatomy',
               'music', 'biology', 'chemistry', 'food', 'linguistics', 'computing', 'sports', 'military',
               'zoology', 'mammals', 'geography', 'games', 'agriculture', 'countries', 'metrology', 'tools',
               'construction', 'geology', 'soccer', 'mythology', 'fish', 'astronomy', 'geometry', 'mechanics',
               'electronics', 'insects', 'electricity', 'physics', 'mathematics', 'birds', 'pharmacology',
               'heraldry', 'textiles', 'mineralogy', 'printing', 'veterinary', 'pathology', 'grammar',
               'bullfighting', 'equestrianism', 'hunting', 'fishing', 'card-games', 'clothing', 'cooking',
               'beverages', 'plants', 'trees', 'reptiles', 'mollusks', 'crustaceans', 'fungi', 'colors',
               'chess', 'theater', 'photography', 'cinema', 'telecommunications', 'aviation', 'railways',
               'automotive', 'jewelry', 'dentistry', 'ophthalmology', 'surgery', 'genetics', 'statistics'}
STOP = set("de la el los las un una unos unas y o u e a al del que en por para con sin se su sus lo le les "
           "como mas más muy no ni es son ser estar algo alguien cosa cosas otro otra otros otras dicho dicha "
           "dichos dichas cual cuales cuyo cuya este esta esto ese esa eso aquel aquella hacer tener haber "
           "persona personas modo manera forma acción efecto propio propia relativo relativa perteneciente "
           "cualidad mucho mucha poco poca todo toda todos todas sobre entre hasta desde".split())

def norm(s): return unicodedata.normalize('NFD', s).translate({ord(c): None for c in '́̈̀'}).lower()

# ---------------- 1. Wikcionario: lemas con sus acepciones ----------------
cache = os.path.join(DATA, 'lemas.pkl')
if os.path.exists(cache):
    lemas = pickle.load(open(cache, 'rb'))
else:
    lemas = {}
    with gzip.open(os.path.join(DATA, 'es-extract.jsonl.gz'), 'rt', encoding='utf-8') as f:
        for line in f:
            if '"lang_code": "es"' not in line: continue
            d = json.loads(line)
            if d.get('lang_code') != 'es' or d.get('pos') not in POS_OK: continue
            w = d.get('word', '')
            if not re.fullmatch(r'[a-záéíóúüñ]+', w): continue           # una sola palabra, sin mayúscula inicial
            senses = [s for s in d.get('senses', []) if 'form-of' not in s.get('tags', [])]
            if not senses: continue
            key = (w, d['pos'])
            e = lemas.setdefault(key, {'w': w, 'pos': d['pos'], 'senses': [], 'syn': set(), 'ant': set(),
                                       'forms': set([w]), 'ety': '', 'cats': set()})
            for s in senses:
                e['senses'].append({'g': (s.get('glosses') or [''])[0], 'tags': s.get('tags', []),
                                    'topics': s.get('topics', []), 'ex': len(s.get('examples', []))})
            for k, dst in (('synonyms', 'syn'), ('antonyms', 'ant')):
                for x in d.get(k, []):
                    if re.fullmatch(r'[a-záéíóúüñ]+', x.get('word', '')): e[dst].add(x['word'])
            for fo in d.get('forms', []):
                fw = fo.get('form', '')
                if re.fullmatch(r'[a-záéíóúüñ]+', fw): e['forms'].add(fw)
            if d.get('etymology_texts') and not e['ety']: e['ety'] = d['etymology_texts'][0]
            e['cats'].update(c for c in d.get('categories', []) if c.startswith('ES:'))
    pickle.dump(lemas, open(cache, 'wb'))
print(f'Lemas (adj/verbo/sust/adv, una palabra): {len(lemas):,}')

# ---------------- 2. Frecuencias: habla (subtítulos) y escritura (prensa) ----------------
def load_freq(path, col_w, col_c, sep):
    d, cap, tot = {}, {}, 0
    with open(path, encoding='utf-8', errors='ignore') as f:
        for line in f:
            p = line.rstrip('\n').split(sep)
            if len(p) <= max(col_w, col_c) or not p[col_w]: continue
            try: c = int(p[col_c])
            except ValueError: continue
            raw = p[col_w]; w = raw.lower(); d[w] = d.get(w, 0) + c; tot += c
            if raw[0].isupper(): cap[w] = cap.get(w, 0) + c
    return d, cap, tot
subs, _, subs_tot = load_freq(os.path.join(DATA, 'es_full.txt'), 0, 1, ' ')
news, news_cap, news_tot = load_freq(os.path.join(DATA, 'news-words.txt'), 1, 2, '\t')
print(f'Subtítulos: {subs_tot/1e6:,.0f} M palabras · Prensa: {news_tot/1e6:,.1f} M palabras')

def metrics(e):
    forms = e['forms']
    f = sum(word_frequency(x, 'es') for x in forms)
    z = math.log10(f * 1e9) if f > 0 else 0.0
    spm = sum(subs.get(x, 0) for x in forms) / subs_tot * 1e6
    npm = sum(news.get(x, 0) for x in forms) / news_tot * 1e6
    reg = math.log10((npm + 0.05) / (spm + 0.05))          # >0: más escrita que hablada
    return z, spm, npm, reg

# Índice de lemas por categoría (para detectar equivalentes dentro de las glosas)
by_pos = defaultdict(set)
for (w, p) in lemas: by_pos[p].add(w)

def usable(s):
    t = set(s['tags'])
    return not (t & BAD_TAGS) and not (t & REGION_TAGS) and not (set(s['topics']) & TECH_TOPICS) and s['g']

ALL_LEMAS = set(w for (w, _) in lemas)
def content(g):
    head = re.split(r'[.;:(]', g)[0]
    return [t for t in re.findall(r'[a-záéíóúüñ]+', head.lower()) if t not in STOP]
def equivalents(e, z):
    """Sinónimos (misma categoría) o palabras de glosas breves claramente más comunes: el «en vez de X»."""
    cands = set(e['syn'])
    for s in e['senses']:
        if not usable(s): continue
        toks = content(s['g'])
        if len(toks) <= 6:                                     # glosas breves tipo «Astuto, listo, avispado»
            cands.update(t for t in toks if t in by_pos[e['pos']])
    out = []
    for c in cands:
        if c == e['w'] or norm(c)[:5] == norm(e['w'])[:5]: continue   # evita la propia familia (ecuanimidad…)
        zc = zipf_frequency(c, 'es')
        if zc >= 3.5 and zc >= z + 0.7: out.append((zc, c))
    return [c for _, c in sorted(out, reverse=True)[:5]]
def plainness(us):
    """¿Se puede definir con palabras de todos los días? Media Zipf de la glosa principal."""
    toks = content(us[0]['g'])
    if not toks: return 0.0, 99
    return sum(zipf_frequency(t, 'es') for t in toks) / len(toks), len(toks)
def transparent(e):
    """Derivado evidente de una palabra común (efectivo → efectividad): aporta poco."""
    m = re.match(r'De ([a-záéíóúüñ]+)\b.*(sufijo|-)', e['ety'] or '')
    return bool(m) and zipf_frequency(m.group(1), 'es') >= 4.0
def is_loan(e):
    """Préstamos recientes del inglés, epónimos y gentilicios: no son «léxico culto»."""
    return any(('provenientes del inglés' in c) or ('origen epónimo' in c) or ('sufijo -és' in c) or ('sufijo -ense' in c)
               for c in e['cats'])
PREFIJOS = ('socio', 'multi', 'poli', 'hispano', 'afro', 'anglo', 'euro', 'macro', 'micro', 'mini', 'auto', 'tele', 'bi', 'uni', 'tri')
def compound(w): return w.startswith(PREFIJOS) and len(w) > 8

# ---------------- 3. Calibración con el conjunto de referencia ----------------
gold_m = {}
for g in GOLD:
    hit = [e for (w, p), e in lemas.items() if w == g]
    if hit: gold_m[g] = metrics(hit[0])
gz = sorted(m[0] for m in gold_m.values())
LO = round(gz[max(0, int(len(gz)*.03))] - 0.25, 2)
HI = round(gz[min(len(gz)-1, int(len(gz)*.97))] + 0.35, 2)
print(f'Referencia: {len(gold_m)}/36 en Wikcionario · Zipf {gz[0]:.2f}–{gz[-1]:.2f} → franja [{LO}, {HI}]')

# ---------------- 4. Embudo ----------------
funnel = defaultdict(int); gold_funnel = defaultdict(set); rows = []
for (w, p), e in lemas.items():
    isg = w in GOLD
    def step(name):
        funnel[name] += 1
        if isg: gold_funnel[name].add(w)
    step('0 lemas')
    us = [s for s in e['senses'] if usable(s)]
    if not us: continue
    step('1 con acepción de uso general')
    if p == 'adv' and w.endswith('mente'): continue          # derivados de adjetivo: se enseñan con él
    step('2 sin adverbios en -mente')
    z, spm, npm, reg = metrics(e)
    if z < LO: continue
    step('3 no rarísimas')
    if z > HI: continue
    step('4 no comunes (franja culta)')
    if npm + spm <= 0.02: continue                           # sin rastro real en prensa ni habla
    step('5 atestiguadas en corpus')
    capr = sum(news_cap.get(x, 0) for x in e['forms']) / max(1, sum(news.get(x, 0) for x in e['forms']))
    if capr > 0.6: continue                                  # casi siempre con mayúscula: apellido, sigla, marca
    step('6 sin nombres propios')
    if is_loan(e): continue
    step('7 sin préstamos recientes')
    eq = equivalents(e, z); pl, ntok = plainness(us)
    if not eq and not (pl >= 4.1 and ntok <= 10): continue
    step('8 con equivalente común')
    if reg < -0.8: continue                                  # casi solo oral/coloquial
    step('9 vivas en la escritura')
    tr = transparent(e) or compound(w)
    # Puntuación de utilidad: frecuencia dentro de la franja, distancia con su equivalente
    # común (cuánto «sube» el registro), presencia en prensa, categoría (adjetivos y verbos
    # son los que más cambian una frase), poca ambigüedad; penaliza derivados obvios.
    fpos = (z - LO) / (HI - LO)
    ref = max([zipf_frequency(c, 'es') for c in eq] + [pl])
    gap = max(0, min(1, (ref - z) / 2.5))
    score = 0.30*fpos + 0.25*gap + 0.15*max(0, min(1, (reg+0.8)/2)) \
            + 0.12*{'adj': 1, 'verb': 1, 'noun': .45, 'adv': .6}[p] + 0.10*(1/len(us)) \
            + 0.08*min(1, len(eq)/2) - (0.18 if tr else 0)
    rows.append({'palabra': w, 'cat': {'adj': 'adjetivo', 'verb': 'verbo', 'noun': 'sustantivo', 'adv': 'adverbio'}[p],
                 'zipf': round(z, 2), 'habla_ppm': round(spm, 3), 'prensa_ppm': round(npm, 3),
                 'registro': round(reg, 2), 'equivalentes': ' | '.join(eq),
                 'sinonimos_wikt': ' | '.join(sorted(e['syn'])[:6]), 'antonimos_wikt': ' | '.join(sorted(e['ant'])[:4]),
                 'acepciones_generales': len(us), 'derivado_obvio': 'sí' if tr else '', 'glosa': us[0]['g'][:160],
                 'etimologia': (e['ety'] or '')[:120], 'puntuacion': round(score, 4), 'referencia': 'sí' if isg else ''})

rows.sort(key=lambda r: -r['puntuacion'])
n = len(rows)
for i, r in enumerate(rows):
    r['nivel'] = 'A' if i < n*0.30 else 'B' if i < n*0.65 else 'C'
fields = ['nivel', 'palabra', 'cat', 'puntuacion', 'zipf', 'registro', 'habla_ppm', 'prensa_ppm', 'equivalentes',
          'sinonimos_wikt', 'antonimos_wikt', 'acepciones_generales', 'derivado_obvio', 'glosa', 'etimologia', 'referencia']
with open(os.path.join(OUT, 'candidatos.csv'), 'w', newline='', encoding='utf-8') as f:
    wr = csv.DictWriter(f, fieldnames=fields); wr.writeheader(); wr.writerows(rows)

gold_final = {r['palabra']: r['nivel'] for r in rows if r['referencia']}
rep = {
    'franja_zipf': [LO, HI],
    'embudo': {k: funnel[k] for k in sorted(funnel)},
    'referencia_en_cada_paso': {k: len(gold_funnel[k]) for k in sorted(gold_funnel)},
    'referencia_recuperada': gold_final,
    'referencia_perdida_en': {g: next((k for k in sorted(gold_funnel) if g not in gold_funnel[k]), '?')
                              for g in GOLD if g not in gold_final},
    'por_nivel': {lv: sum(1 for r in rows if r['nivel'] == lv) for lv in 'ABC'},
    'por_categoria': {c: sum(1 for r in rows if r['cat'] == c) for c in ('adjetivo', 'verbo', 'sustantivo', 'adverbio')},
    'percentil_referencia': sorted(round(100*(1-i/n)) for i, r in enumerate(rows) if r['referencia']),
    'muestra_A': [r['palabra'] for r in rows[:80]],
}
json.dump(rep, open(os.path.join(OUT, 'informe.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
print(json.dumps(rep, ensure_ascii=False, indent=2))
