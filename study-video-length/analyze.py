"""Summarize length.jsonl: how long the most-subscribed channels' latest long-form videos run, how many of their recent
uploads are Shorts, by Wikipedia category. Long-form = the channel's Videos tab (YouTube files Shorts and live streams
separately); durations from the flat tab listing. Upload mix = the 15 latest uploads in the channel's RSS feed, each
classed as a Short (in the Shorts tab), a live stream (Streams tab) or a video (Videos tab).
python3 analyze.py OUT.json"""
import json, statistics, sys
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).parent
chans = {c['rank']: c for c in json.loads((HERE.parent / 'study-auto-captions' / 'coverage-channels.json').read_text())['channels']}
meta = {int(k): v for k, v in json.loads((HERE / 'channels-meta.json').read_text()).items()}
rows = {}
for l in (HERE / 'length.jsonl').read_text().splitlines():
    r = json.loads(l)
    if r['status'] == 'ok':
        rows[r['rank']] = r


def clean(name):
    import re
    return re.sub(r'\{\{.*?\}\}', '', name).split('|')[-1].strip()


MIN_V = 10  # a channel needs 10+ long-form videos with a duration to count
BUCKETS = [(0, 2), (2, 5), (5, 10), (10, 20), (20, 40), (40, 60), (60, 10**9)]
table, pooled = [], []
for rank, c in chans.items():
    r = rows.get(rank)
    if not r:
        continue
    d = [v['duration'] / 60 for v in r['videos'] if v.get('duration')]
    vids, shorts, streams = {v['id'] for v in r['videos']}, set(r['shorts']), set(r['streams'])
    mix = Counter('short' if x['id'] in shorts else 'stream' if x['id'] in streams else 'video' if x['id'] in vids else 'unknown' for x in r['rss'])
    dates = sorted(x['published'][:10] for x in r['rss'])
    row = {'rank': rank, 'name': clean(c['name']), 'category': meta[rank]['category'], 'language': c['language'], 'subs_m': c['subs_m'],
           'videos_with_duration': len(d), 'median_min': round(statistics.median(d), 2) if d else None,
           'mean_min': round(statistics.mean(d), 2) if d else None, 'rss_uploads': len(r['rss']), 'rss_mix': dict(mix),
           'rss_oldest': dates[0] if dates else None, 'rss_newest': dates[-1] if dates else None,
           'has_shorts_tab': bool(shorts)}
    table.append(row)
    if len(d) >= MIN_V:
        pooled += [(rank, x) for x in d]

ok = [t for t in table if t['videos_with_duration'] >= MIN_V]
allmins = [x for _, x in pooled]
mix_all = Counter()
for t in table:
    mix_all.update(t['rss_mix'])
tot = under3 = 0
for r in rows.values():
    vd = {v['id']: v.get('duration') for v in r['videos']}
    for x in r['rss']:
        if x['id'] in r['shorts']:
            tot += 1; under3 += 1          # Shorts run 3 minutes at most (YouTube, Oct 15, 2024)
        elif vd.get(x['id']):
            tot += 1; under3 += vd[x['id']] < 180
        elif x['id'] in r['streams']:
            tot += 1
rss_dates = sorted(x['published'][:10] for r in rows.values() for x in r['rss'])
cat = defaultdict(list)
for t in ok:
    cat[t['category'].split('/')[0]].append(t)
out = {
    'channels_listed': len(chans), 'channels_read': len(table), 'channels_counted': len(ok), 'min_videos': MIN_V,
    'videos': len(allmins), 'median_min': round(statistics.median(allmins), 2), 'mean_min': round(statistics.mean(allmins), 2),
    'p25_min': round(statistics.quantiles(allmins, n=4)[0], 2), 'p75_min': round(statistics.quantiles(allmins, n=4)[2], 2),
    'median_of_channel_medians': round(statistics.median(t['median_min'] for t in ok), 2),
    'buckets': [{'lo': lo, 'hi': hi, 'n': sum(1 for x in allmins if lo <= x < hi)} for lo, hi in BUCKETS],
    'rss_mix': dict(mix_all), 'rss_uploads': sum(mix_all.values()),
    'channels_mostly_shorts': sum(1 for t in table if t['rss_uploads'] and t['rss_mix'].get('short', 0) > t['rss_uploads'] / 2),
    'channels_no_shorts_in_feed': sum(1 for t in table if t['rss_uploads'] and not t['rss_mix'].get('short')),
    'rss_classified': tot, 'rss_under_3_min': under3, 'rss_dates': [rss_dates[0], statistics.median_low(rss_dates), rss_dates[-1]],
    'channels_all_shorts': sum(1 for t in table if t['rss_uploads'] and t['rss_mix'].get('short', 0) == t['rss_uploads']),
    'by_category': {k: {'channels': len(v), 'median_of_medians': round(statistics.median(t['median_min'] for t in v), 2),
                        'videos': sum(t['videos_with_duration'] for t in v)} for k, v in sorted(cat.items(), key=lambda kv: -len(kv[1]))},
    'channels': table,
}
Path(sys.argv[1]).write_text(json.dumps(out, indent=1, ensure_ascii=False))
print(json.dumps({k: v for k, v in out.items() if k != 'channels'}, indent=1, ensure_ascii=False))
