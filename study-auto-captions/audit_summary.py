"""Summarize the hand audit: audit/labels.json (item -> E/V/H/R/U) over audit/items-<channel>.jsonl samples.
python3 audit_summary.py OUT.json   -> shares per kind (substitution/deletion vs insertion), overall and per channel.
Every channel contributes the same number of items, so overall shares weight channels equally."""
import json, sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).parent
L = json.loads((HERE / 'audit' / 'labels.json').read_text())
CLASSES = 'EVHRU'


def share(labels):
    c = Counter(labels)
    n = len(labels)
    return {'n': n, **{f'{k}_n': c[k] for k in CLASSES}, **{f'{k}_pct': round(100 * c[k] / n) for k in CLASSES}}


out = {'per_channel': {}}
for kind in ('sd', 'ins'):
    out[kind] = share([v for k, v in L.items() if f'-{kind}-' in k])
for ch in sorted({k.split('-')[0] for k in L}):
    out['per_channel'][ch] = {kind: share([v for k, v in L.items() if k.startswith(f'{ch}-{kind}-')]) for kind in ('sd', 'ins')}
out['per_channel_sd'] = max(v['sd']['n'] for v in out['per_channel'].values())
out['per_channel_ins'] = max(v['ins']['n'] for v in out['per_channel'].values())
Path(sys.argv[1]).write_text(json.dumps(out, indent=1))
print(json.dumps({k: out[k] for k in ('sd', 'ins')}, indent=1))
for ch, v in out['per_channel'].items():
    print(ch, 'sd', {k: v['sd'][f'{k}_n'] for k in CLASSES}, 'ins', {k: v['ins'][f'{k}_n'] for k in CLASSES})
