"""Verify every example the page quotes against the raw tracks, and count the repeated ones.
python3 examples.py OUT.json   -> fails loudly if any quoted phrase is not in the track it is attributed to."""
import csv, json, sys
from captext import HERE, text

rows = {r['id']: r for r in csv.DictReader((HERE / 'results.csv').open())}


def track(vid, kind):
    return text(HERE / 'subs' / rows[vid]['channel'].lstrip('@') / f'{vid}.{kind}.json3')


# (video, phrase in the human track, phrase in the automatic track)
QUOTED = [
    ('6pHKGo9bUZw', 'Christa McAuliffe', 'Christa muli'),
    ('6pHKGo9bUZw', 'Kalpana Chawla', 'capna chuala'),
    ('6pHKGo9bUZw', 'Ilan Ramon', 'Elon Ramon'),
    ('_CDawqpzMlM', "most people can't afford the time", 'most people can afford the time'),
    ('U3QPU8bzLs8', 'the spirit of irreverence', 'the spirit of a reverence'),
]
out = {'quoted': []}
for vid, h, a in QUOTED:
    assert h in track(vid, 'human'), (vid, h)
    assert a in track(vid, 'auto'), (vid, a)
    out['quoted'].append({'id': vid, 'channel': rows[vid]['channel'], 'title': rows[vid]['title'], 'human': h, 'auto': a})

st = [v for v, r in rows.items() if r['channel'] == '@stanford']
out['stamford'] = {'auto_count': sum(track(v, 'auto').count('Stamford') for v in st),
                   'videos': sum('Stamford' in track(v, 'auto') for v in st), 'of': len(st),
                   'human_count': sum(track(v, 'human').count('Stamford') for v in st)}
assert out['stamford']['human_count'] == 0
km = [v for v, r in rows.items() if r['channel'] == '@khanacademy']
out['khanmigo'] = {'human_count': sum(track(v, 'human').count('Khanmigo') for v in km),
                   'auto_count': sum(track(v, 'auto').count('Khanmigo') for v in km)}
Path = type(HERE)
Path(sys.argv[1]).write_text(json.dumps(out, indent=1, ensure_ascii=False))
print(json.dumps({k: out[k] for k in ('stamford', 'khanmigo')}))
