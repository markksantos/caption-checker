"""Summarize dub.jsonl: which of the most-subscribed channels ship their latest videos with audio in other languages,
how many languages, made by whom (YouTube's acont tag: 'dubbed' and any automatic variant), and how that lines up with
category, primary language and the channel's own captions (study-auto-captions/coverage.jsonl).
python3 analyze.py OUT.json  -> per-channel table + headline counts"""
import json, statistics, sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).parent
chans = {c['rank']: c for c in json.loads((HERE.parent / 'study-auto-captions' / 'coverage-channels.json').read_text())['channels']}
meta = {int(k): v for k, v in json.loads((HERE / 'channels-meta.json').read_text()).items()}
caps = {}
for line in (HERE.parent / 'study-auto-captions' / 'coverage.jsonl').read_text().splitlines():
    r = json.loads(line)
    if r['status'] == 'ok':
        caps[r['id']] = r['human_tracks']
vids = {}
for line in (HERE / 'dub.jsonl').read_text().splitlines():
    r = json.loads(line)
    if r['status'] == 'ok':
        vids.setdefault(r['rank'], {})[r['id']] = r


def dubs(v):
    """language -> acont for every non-original track YouTube tags as a dub"""
    return {lang: t['acont'] for lang, t in v['audio'].items() if (t['acont'] or '').startswith('dubbed')}


def clean(name):
    import re
    name = re.sub(r'\{\{.*?\}\}', '', name)
    return name.split('|')[-1].strip()


rows = []
for rank, c in chans.items():
    v = list(vids.get(rank, {}).values())
    if len(v) < 3:  # same rule as the caption-coverage study
        continue
    d = [dubs(x) for x in v]
    kinds = Counter(k for x in d for k in x.values())
    rows.append({'rank': rank, 'name': clean(c['name']), 'subs_m': c['subs_m'], 'language': c['language'],
                 'category': meta[rank]['category'], 'country': meta[rank]['country'], 'videos': len(v),
                 'dubbed_videos': sum(1 for x in d if x), 'max_dub_languages': max(len(x) for x in d),
                 'dub_kinds': dict(kinds), 'dub_languages': sorted({l for x in d for l in x}),
                 'own_captions': sum(1 for x in v if caps.get(x['id']))})


def summary(rs):
    vs = [vv for r in rs for vv in vids[r['rank']].values()]
    dv = [dubs(x) for x in vs if dubs(x)]
    langs = Counter(l for x in dv for l in x)
    return {'channels': len(rs), 'channels_any_dub': sum(r['dubbed_videos'] > 0 for r in rs),
            'channels_all_dub': sum(r['dubbed_videos'] == r['videos'] for r in rs),
            'videos': len(vs), 'videos_dubbed': len(dv),
            'median_languages_when_dubbed': statistics.median([len(x) for x in dv]) if dv else 0,
            'max_languages': max((len(x) for x in dv), default=0),
            'track_kinds': dict(Counter(k for x in dv for k in x.values())),
            'top_languages': langs.most_common(12)}


eng = [r for r in rows if r['language'].startswith('English')]
music = [r for r in rows if r['category'].startswith('Music')]
nonmusic = [r for r in rows if not r['category'].startswith('Music')]
out = {'listed': len(chans), 'all': summary(rows), 'english': summary(eng), 'non_english': summary([r for r in rows if r not in eng]),
       'music': summary(music), 'non_music': summary(nonmusic),
       'by_category': {cat: summary([r for r in rows if r['category'] == cat]) for cat in sorted({r['category'] for r in rows})},
       'dubbing_channels': [r for r in rows if r['dubbed_videos']], 'channels': rows}
# ---- who made the dubs: the channel ('dubbed') or YouTube's automatic dubbing ('dubbed-auto') -----------------
table = [vv for r in rows for vv in vids[r['rank']].values()]
kind = lambda v, k: sorted(l for l, t in v['audio'].items() if t['acont'] == k)  # noqa: E731
orig = lambda v: next((l for l, t in v['audio'].items() if t['acont'] == 'original'), v.get('language'))  # noqa: E731
cm = [v for v in table if kind(v, 'dubbed')]
ca = [v for v in table if kind(v, 'dubbed-auto')]
from_en = sorted({l for v in ca if (orig(v) or '').startswith('en') for l in kind(v, 'dubbed-auto')})
pairs = Counter((orig(v), l) for v in ca if not (orig(v) or '').startswith('en') for l in kind(v, 'dubbed-auto'))
base = lambda l: l if l.startswith('zh') else l.split('-')[0]  # noqa: E731
out['split'] = {
    'videos_creator': len(cm), 'videos_auto': len(ca), 'videos_both': len([v for v in cm if v in ca]),
    'channels_creator': len({v['rank'] for v in cm}), 'channels_auto': len({v['rank'] for v in ca}),
    'channels_both': len({v['rank'] for v in cm} & {v['rank'] for v in ca}),
    'tracks_creator': sum(len(kind(v, 'dubbed')) for v in cm), 'tracks_auto': sum(len(kind(v, 'dubbed-auto')) for v in ca),
    'median_langs_creator': statistics.median(len(kind(v, 'dubbed')) for v in cm),
    'median_langs_auto': statistics.median(len(kind(v, 'dubbed-auto')) for v in ca),
    'median_langs_auto_from_english': statistics.median(len(kind(v, 'dubbed-auto')) for v in ca if (orig(v) or '').startswith('en')),
    'auto_from_english_languages': from_en, 'auto_from_other_pairs': [[a, b, n] for (a, b), n in pairs.most_common()],
    'creator_languages': Counter(base(l) for v in cm for l in kind(v, 'dubbed')).most_common(),
    'creator_language_count': len({base(l) for v in cm for l in kind(v, 'dubbed')}),
    'creator_without_own_captions': sum(1 for v in cm if not caps.get(v['id'])),
    'auto_without_own_captions': sum(1 for v in ca if not caps.get(v['id'])),
    'dubbed_without_own_captions': sum(1 for v in table if dubs(v) and not caps.get(v['id'])),
    'dub_channels_no_own_captions': sum(1 for r in rows if r['dubbed_videos'] and r['own_captions'] == 0),
    'upload_dates': [min(v['upload_date'] for v in table), statistics.median_low([v['upload_date'] for v in table]), max(v['upload_date'] for v in table)],
}
out['videos'] = [{'rank': v['rank'], 'channel': next(r['name'] for r in rows if r['rank'] == v['rank']), 'id': v['id'], 'title': v['title'],
                  'upload_date': v['upload_date'], 'duration': v['duration'], 'original_language': orig(v),
                  'channel_dubs': kind(v, 'dubbed'), 'youtube_auto_dubs': kind(v, 'dubbed-auto'), 'own_caption_languages': caps.get(v['id'], [])}
                 for v in table]
Path(sys.argv[1]).write_text(json.dumps(out, indent=1, ensure_ascii=False))
print(json.dumps(out['split'], ensure_ascii=False)[:1500])
print(json.dumps({k: out[k] for k in ('all', 'english', 'non_english', 'music', 'non_music')}, indent=1, ensure_ascii=False))
for r in out['dubbing_channels']:
    print(r['rank'], r['name'], r['category'], r['language'], f"{r['dubbed_videos']}/{r['videos']}", r['max_dub_languages'], r['dub_kinds'])
