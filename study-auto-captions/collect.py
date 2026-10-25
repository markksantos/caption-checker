"""Collect human and automatic English caption tracks for the most recent eligible uploads of each channel.
Eligible: 2+ minutes, a human (uploaded) English track, and YouTube's automatic English track ('en-orig').
python3 collect.py [per_channel=50] [scan=150]   -> subs/<channel>/<id>.human.json3 / .auto.json3, videos.jsonl (resumable)"""
import json, os, random, sys, time
from pathlib import Path
from yt_dlp import YoutubeDL

CHANNELS = ['@mitocw', '@NASA', '@TED', '@khanacademy', '@crashcourse', '@stanford']
if os.environ.get('CHANNELS'):  # e.g. CHANNELS=@TED to run one channel (two runs can split the list)
    CHANNELS = os.environ['CHANNELS'].split(',')
PER = int(sys.argv[1]) if len(sys.argv) > 1 else 50
SCAN = int(sys.argv[2]) if len(sys.argv) > 2 else 150
HERE = Path(__file__).parent
OUT = HERE / 'videos.jsonl'
done = {json.loads(l)['id']: json.loads(l) for l in OUT.read_text().splitlines()} if OUT.exists() else {}
done = {k: v for k, v in done.items() if not v['status'].startswith('error')}  # a re-run retries load errors once
opts = {'quiet': True, 'no_warnings': True, 'skip_download': True}


def pick_human(subs):
    for k in ('en', 'en-US', 'en-GB', 'en-CA', 'en-AU'):
        if k in subs:
            return k
    named = [k for k in subs if k.startswith('en-') and len(k) > 6]
    return named[0] if named else None


def json3(tracks):
    return next((t['url'] for t in tracks if t.get('ext') == 'json3'), None)


with YoutubeDL(opts) as ydl, OUT.open('a') as log:
    for ch in CHANNELS:
        flat = ydl.extract_info(f'https://www.youtube.com/{ch}/videos', download=False, process=False)
        entries = [e for _, e in zip(range(SCAN), flat['entries'])]
        have = sum(1 for v in done.values() if v['channel'] == ch and v['status'] == 'ok')
        for e in entries:
            if have >= PER:
                break
            vid = e['id']
            if vid in done:
                continue
            row = {'id': vid, 'channel': ch, 'title': e.get('title'), 'duration': e.get('duration')}
            if (e.get('duration') or 0) < 120:
                row['status'] = 'short'
            else:
                try:
                    info = ydl.extract_info(f'https://www.youtube.com/watch?v={vid}', download=False)
                    row.update(duration=info.get('duration'), upload_date=info.get('upload_date'), title=info.get('title'))
                    h = pick_human(info.get('subtitles') or {})
                    auto = info.get('automatic_captions') or {}
                    a = 'en-orig' if 'en-orig' in auto else None  # YouTube's own speech recognition; a bare 'en' can be a translation
                    row.update(human_track=h, auto_track=a)
                    if not h or not a:
                        row['status'] = 'no-human' if not h else 'no-auto'
                    else:
                        d = HERE / 'subs' / ch.lstrip('@')
                        d.mkdir(parents=True, exist_ok=True)
                        for kind, url in (('human', json3(info['subtitles'][h])), ('auto', json3(auto[a]))):
                            (d / f'{vid}.{kind}.json3').write_bytes(ydl.urlopen(url).read())
                            time.sleep(random.uniform(1.5, 3))
                        row['status'] = 'ok'
                        have += 1
                except Exception as ex:
                    row['status'] = f'error: {str(ex)[:120]}'
                time.sleep(random.uniform(2, 4))
            done[vid] = row
            log.write(json.dumps(row) + '\n'); log.flush()
            print(ch, have, vid, row['status'], flush=True)
        print(f'== {ch}: {have} ok', flush=True)
