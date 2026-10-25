"""Summarize coverage.jsonl: per channel, how many of its latest regular uploads carry a caption track the channel uploaded.
python3 coverage_analyze.py OUT.json   -> channel table + headline counts (all channels, English-language channels)"""
import json, sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).parent
import re


def clean(name):
    name = re.sub(r'\{\{.*?\}\}', '', name)          # {{efn|...}} footnote templates
    return name.split('|')[-1].strip()              # [[Target|Label]] leftovers keep the label


chans = {c['rank']: {**c, 'name': clean(c['name'])} for c in json.loads((HERE / 'coverage-channels.json').read_text())['channels']}
vids = {}
for line in (HERE / 'coverage.jsonl').read_text().splitlines():
    r = json.loads(line)
    if r['status'] == 'ok':
        vids.setdefault(r['rank'], {})[r['id']] = r   # dedupe by video id

rows = []
for rank, c in chans.items():
    v = list(vids.get(rank, {}).values())
    if len(v) < 3:          # channel unreadable or too few regular uploads: left out, listed in 'skipped'
        continue
    own = sum(1 for x in v if x['human_tracks'])
    eng = sum(1 for x in v if any(t == 'en' or t.startswith('en-') for t in x['human_tracks']))
    auto = sum(1 for x in v if x['auto_orig'])
    neither = sum(1 for x in v if not x['human_tracks'] and not x['auto_orig'])
    auto_only = sum(1 for x in v if x['auto_orig'] and not x['human_tracks'])
    langs = Counter(t.split('-')[0] for x in v for t in x['human_tracks'])
    rows.append({'rank': rank, 'name': c['name'], 'subs_m': c['subs_m'], 'language': c['language'], 'videos': len(v), 'own_captions': own,
                 'own_english': eng, 'auto_captions': auto, 'auto_only': auto_only, 'no_captions_at_all': neither,
                 'max_languages': max((len(x['human_tracks']) for x in v), default=0), 'top_langs': [k for k, _ in langs.most_common(3)]})

def summary(rs):
    n = len(rs)
    return {'channels': n,
            'all_own': sum(r['own_captions'] == r['videos'] for r in rs),
            'some_own': sum(0 < r['own_captions'] < r['videos'] for r in rs),
            'no_own': sum(r['own_captions'] == 0 for r in rs),
            'videos': sum(r['videos'] for r in rs),
            'videos_own': sum(r['own_captions'] for r in rs),
            'videos_auto_only': sum(r['auto_only'] for r in rs),
            'videos_none': sum(r['no_captions_at_all'] for r in rs),
            'channels_with_any_none': sum(r['no_captions_at_all'] > 0 for r in rs)}

eng = [r for r in rows if r['language'].startswith('English')]
meta = json.loads((HERE / 'coverage-channels.json').read_text())
out = {'listed': len(chans), 'per': max(r['videos'] for r in rows), 'revid': meta['source_revid'], 'fetched': meta['fetched'], 'all': summary(rows), 'english': summary(eng), 'skipped': [c['name'] for k, c in chans.items() if len(vids.get(k, {})) < 3],
       'channels': rows}
Path(sys.argv[1]).write_text(json.dumps(out, indent=1, ensure_ascii=False))
print(json.dumps({k: out[k] for k in ('all', 'english', 'skipped')}, indent=1, ensure_ascii=False))
