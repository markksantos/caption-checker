"""Caption-track text extraction + normalization shared by analyze.py and the audit tools.
Both tracks: sound tags ([Music], (applause)), speaker labels (NARRATOR:), >> markers and music notes removed,
curly apostrophes straightened, then OpenAI Whisper's English text normalizer (case, punctuation, numbers,
British/American spellings, um/uh/hmm), then two spoken-variant spellings unified (ok -> okay, cuz -> because)."""
import json, re
from pathlib import Path
from whisper_normalizer.english import EnglishTextNormalizer

HERE = Path(__file__).parent
_norm = EnglishTextNormalizer()
TAG = re.compile(r'\[[^\]]*\]|\([^)]*\)|(?m:^\*[^*\n]{1,40}\*$)|♪+|>>+|&gt;&gt;')  # *jazzy music* lines too
MARKUP = re.compile(r'</?[a-zA-Z][^>]*>')  # <b>, <i>, <font color=...> styling inside caption text
SPEAKER = re.compile(r'(?m)^\s*-?\s*[A-Z][A-Z0-9 .\'-]{1,30}:\s')
VARIANT = {'ok': 'okay', 'cuz': 'because', 'cause': 'because'}


def text(path):
    out = []
    for ev in json.loads(path.read_text()).get('events', []):
        line = ''.join(s.get('utf8', '') for s in ev.get('segs') or [])
        if line.strip():
            out.append(line)
    t = MARKUP.sub('', '\n'.join(out)).replace('’', "'").replace('‘', "'").replace('…', ' ')
    t = SPEAKER.sub(' ', t)
    return ' '.join(TAG.sub(' ', t).split())


def norm(t):
    return ' '.join(VARIANT.get(w, w) for w in _norm(t).split() if any(ch.isalnum() for ch in w))  # a lone '.' is not a word


LIGHT = re.compile(r"[^\w']+")
PRONOUN_I = {'i', "i'm", "i've", "i'll", "i'd"}


ROMAN = re.compile(r'^[ivxl]+$')


def light_tokens(t, variants=False):
    """Naive scoring (lowercase, punctuation stripped), keeping each token's original casing and whether it
    opens a sentence, so missed words can be split into capitalized mid-sentence terms vs everything else.
    variants=True also unifies ok/okay etc. and keeps OK, Roman numerals and digits out of the term class."""
    toks, start = [], True
    for raw in t.split():
        w = LIGHT.sub('', raw.lower()).strip("'")
        if w:
            if variants:
                w = VARIANT.get(w, w)
            cap = (raw.lstrip('"\'(-')[:1].isupper() and not start and w not in PRONOUN_I and not w.isdigit()
                   and not (variants and (w == 'okay' or ROMAN.match(w))))
            toks.append((w, cap))
        start = raw.rstrip('"\')').endswith(('.', '?', '!', ':'))
    return toks


def pair(channel, vid):
    """(human, auto) normalized word strings for one video."""
    d = HERE / 'subs' / channel.lstrip('@')
    return norm(text(d / f'{vid}.human.json3')), norm(text(d / f'{vid}.auto.json3'))
