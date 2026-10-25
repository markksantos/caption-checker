"""Word error rate of YouTube's automatic English captions, scored against each video's human caption track.
python3 analyze.py  -> results.csv (one row per video) + summary printed
missed_pct = (substitutions + deletions) / human words: the human caption's words the automatic track got wrong
or left out. Insertions are reported apart because most are fillers the human captioner edited out (audit notes)."""
import csv, json, statistics as st
import jiwer

from captext import HERE, light_tokens, pair, text
from derived import timing_match


CAPS_MAX = 0.25  # the median human track has 3.6% capitalized mid-sentence words; above 25% it is written in capitals


def naive(channel, vid):
    """Naive WER plus misses split by capitalized mid-sentence terms vs other words (light normalization)."""
    d = HERE / 'subs' / channel.lstrip('@')
    ref_t, hyp_t = text(d / f'{vid}.human.json3'), text(d / f'{vid}.auto.json3')
    naive_wer = jiwer.wer(' '.join(w for w, _ in light_tokens(ref_t)), ' '.join(w for w, _ in light_tokens(hyp_t)))
    rt = light_tokens(ref_t, variants=True)
    ht = [w for w, _ in light_tokens(hyp_t, variants=True)]
    o = jiwer.process_words(' '.join(w for w, _ in rt), ' '.join(ht))
    miss = [False] * len(rt)
    for c in o.alignments[0]:
        if c.type in ('substitute', 'delete'):
            for i in range(c.ref_start_idx, c.ref_end_idx):
                miss[i] = True
    if sum(k for _, k in rt) > CAPS_MAX * len(rt):  # all-caps or title-case human track: names can't be told apart
        return naive_wer, 0, 0, 0, 0
    cap = [m for m, (_, k) in zip(miss, rt) if k]
    other = [m for m, (_, k) in zip(miss, rt) if not k]
    return naive_wer, len(cap), sum(cap), len(other), sum(other)


rows = []
seen = set()
derived_out = []
for v in map(json.loads, (HERE / 'videos.jsonl').read_text().splitlines()):
    if v['status'] != 'ok' or v['id'] in seen:  # a video logged twice (two collector runs) counts once
        continue
    seen.add(v['id'])
    if timing_match(v['channel'], v['id']) > 50:  # human track made by editing the automatic one: not an independent yardstick
        derived_out.append((v['channel'], v['id']))
        continue
    ref, hyp = pair(v['channel'], v['id'])
    if not ref.split():
        continue
    o = jiwer.process_words(ref, hyp)
    n = len(ref.split())
    nw, cap_n, cap_miss, oth_n, oth_miss = naive(v['channel'], v['id'])
    rows.append({'channel': v['channel'], 'id': v['id'], 'title': v['title'], 'upload_date': v.get('upload_date'),
                 'minutes': round(v['duration'] / 60, 1), 'human_track': v['human_track'], 'auto_track': v['auto_track'],
                 'ref_words': n, 'auto_words': len(hyp.split()), 'words_per_minute': round(n / (v['duration'] / 60)),
                 'substitutions': o.substitutions, 'deletions': o.deletions, 'insertions': o.insertions,
                 'missed_pct': round(100 * (o.substitutions + o.deletions) / n, 2), 'wer_pct': round(100 * o.wer, 2),
                 'naive_wer_pct': round(100 * nw, 2), 'cap_terms': cap_n, 'cap_terms_missed': cap_miss,
                 'other_words': oth_n, 'other_words_missed': oth_miss})

(HERE / 'excluded.json').write_text(json.dumps({'derived_from_auto': derived_out, 'timing_match': [timing_match(c, v) for c, v in derived_out]}))
with (HERE / 'results.csv').open('w', newline='') as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0]))
    w.writeheader(); w.writerows(rows)

print(f"{len(rows)} videos, median missed {st.median(r['missed_pct'] for r in rows):.2f}%, median WER {st.median(r['wer_pct'] for r in rows):.2f}%, median naive WER {st.median(r['naive_wer_pct'] for r in rows):.2f}%")
cn, cm = sum(r['cap_terms'] for r in rows), sum(r['cap_terms_missed'] for r in rows)
on, om = sum(r['other_words'] for r in rows), sum(r['other_words_missed'] for r in rows)
print(f"capitalized mid-sentence terms missed {cm}/{cn} = {100*cm/cn:.1f}%  vs other words {om}/{on} = {100*om/on:.1f}%  (naive scoring)")
for ch in dict.fromkeys(r['channel'] for r in rows):
    c = [r for r in rows if r['channel'] == ch]
    m = [r['missed_pct'] for r in c]
    print(f"  {ch:14} n={len(c):3}  missed median {st.median(m):5.2f}% (min {min(m):.2f}, max {max(m):.2f})  WER median {st.median(r['wer_pct'] for r in c):5.2f}%")
