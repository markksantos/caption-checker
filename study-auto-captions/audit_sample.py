"""Random sample of disagreements for the hand audit (seeded, so the sample is reproducible).
python3 audit_sample.py [per_channel_sd=40] [per_channel_ins=20]  -> audit/items.jsonl + audit/sheet.txt
Each item: one substitution/deletion span or one insertion span, with 6 words of context from both tracks.
Classes, filled in by hand into audit/labels.json ({item_id: class}):
  E  real automatic-caption error (wrong, missing or invented word)
  V  same words written differently (spelling, number/unit format, compound split, contraction)
  H  the human track departs from what was said (dropped filler, false start or repetition; paraphrase)
  R  the human track is wrong and the automatic track has it right (misheard or misspelled word in the human captions)
  U  cannot tell from the text"""
import json, random, sys
import jiwer
from captext import HERE, pair

SD = int(sys.argv[1]) if len(sys.argv) > 1 else 40
INS = int(sys.argv[2]) if len(sys.argv) > 2 else 20
spans = {}
seen = set()
for v in map(json.loads, (HERE / 'videos.jsonl').read_text().splitlines()):
    if v['status'] != 'ok' or v['id'] in seen:  # a video logged twice (two collector runs) counts once
        continue
    seen.add(v['id'])
    ref, hyp = pair(v['channel'], v['id'])
    o = jiwer.process_words(ref, hyp)
    r, h = o.references[0], o.hypotheses[0]
    for c in o.alignments[0]:
        if c.type == 'equal':
            continue
        kind = 'ins' if c.type == 'insert' else 'sd'
        spans.setdefault((v['channel'], kind), []).append({
            'channel': v['channel'], 'id': v['id'], 'type': c.type,
            'human': ' '.join(r[max(0, c.ref_start_idx - 6):c.ref_start_idx]) + ' [' + ' '.join(r[c.ref_start_idx:c.ref_end_idx]) + '] ' + ' '.join(r[c.ref_end_idx:c.ref_end_idx + 6]),
            'auto': ' '.join(h[max(0, c.hyp_start_idx - 6):c.hyp_start_idx]) + ' [' + ' '.join(h[c.hyp_start_idx:c.hyp_end_idx]) + '] ' + ' '.join(h[c.hyp_end_idx:c.hyp_end_idx + 6]),
            'ref_words': c.ref_end_idx - c.ref_start_idx, 'hyp_words': c.hyp_end_idx - c.hyp_start_idx})

items = []
only = sys.argv[3] if len(sys.argv) > 3 else None
for (ch, kind), lst in sorted(spans.items()):
    if only and ch != only:
        continue
    rng = random.Random(f'20261025-{ch}-{kind}')  # per channel and kind, so one channel's sample never shifts another's
    for j, s in enumerate(rng.sample(lst, min(len(lst), SD if kind == 'sd' else INS))):
        s['item'] = f"{ch[1:].lower()}-{kind}-{j:02d}"
        items.append(s)
(HERE / 'audit').mkdir(exist_ok=True)
with (HERE / 'audit' / 'items.jsonl').open('w') as f:
    for s in items:
        f.write(json.dumps(s) + '\n')
with (HERE / 'audit' / 'sheet.txt').open('w') as f:
    for s in items:
        f.write(f"{s['item']} {s['channel'][1:5]} {s['type'][:3]} | H: {s['human']} | A: {s['auto']}\n")
print(len(items), 'items ->', HERE / 'audit' / 'sheet.txt')
