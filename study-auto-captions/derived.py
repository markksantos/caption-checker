"""Share of a human track's caption start times that exactly match the automatic track's (a copy of the ASR keeps them)."""
import json
from captext import HERE


def starts(path):
    return [e['tStartMs'] for e in json.loads(path.read_text()).get('events', [])
            if 'tStartMs' in e and ''.join(s.get('utf8', '') for s in e.get('segs') or []).strip()]


def timing_match(channel, vid):
    d = HERE / 'subs' / channel.lstrip('@')
    h, a = starts(d / f'{vid}.human.json3'), set(starts(d / f'{vid}.auto.json3'))
    return round(100 * sum(t in a for t in h) / max(1, len(h)), 1)


if __name__ == '__main__':
    import csv
    rows = list(csv.DictReader((HERE / 'results.csv').open()))
    out = sorted(((timing_match(r['channel'], r['id']), float(r['wer_pct']), r['channel'], r['id']) for r in rows), reverse=True)
    for x in out[:20]:
        print(x)
    import statistics
    print('median timing match', statistics.median(x[0] for x in out), ' >50%:', sum(x[0] > 50 for x in out))
