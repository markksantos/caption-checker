"""Dubbed audio on the most-subscribed YouTube channels: re-reads every video in the caption-coverage sample
(../study-auto-captions/coverage.jsonl: latest 5 regular uploads of each channel in Wikipedia's most-subscribed list) and records
its audio tracks. Each audio stream URL carries YouTube's own track type in its xtags parameter
("acont=original:lang=en", "acont=dubbed:lang=es", and whatever other acont values YouTube uses, kept verbatim).
python3 collect.py   -> dub.jsonl (resumable; failed loads are retried on a re-run)"""
import json, random, time
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from yt_dlp import YoutubeDL

HERE = Path(__file__).parent
SRC = HERE.parent / 'study-auto-captions' / 'coverage.jsonl'
OUT = HERE / 'dub.jsonl'

sample = {}
for line in SRC.read_text().splitlines():
    r = json.loads(line)
    if r['status'] == 'ok':
        sample.setdefault(r['id'], r['rank'])
done = set()
if OUT.exists():
    done = {json.loads(l)['id'] for l in OUT.read_text().splitlines() if json.loads(l)['status'] == 'ok'}

with YoutubeDL({'quiet': True, 'no_warnings': True, 'skip_download': True}) as ydl, OUT.open('a') as log:
    for vid, rank in sample.items():
        if vid in done:
            continue
        try:
            info = ydl.extract_info(f'https://www.youtube.com/watch?v={vid}', download=False)
        except Exception as ex:
            log.write(json.dumps({'rank': rank, 'id': vid, 'status': 'error', 'error': str(ex)[:150]}) + '\n'); log.flush()
            continue
        tracks = {}  # language -> {'acont': YouTube's own track type from the stream URL's xtags, 'label': yt-dlp's display label}
        for f in info.get('formats') or []:
            if f.get('vcodec') != 'none' or f.get('acodec') in (None, 'none') or not f.get('language'):
                continue
            t = tracks.setdefault(f['language'], {'acont': None, 'label': None})
            xt = parse_qs(urlparse(f.get('url') or '').query).get('xtags', [''])[0]   # e.g. "acont=dubbed:lang=es"
            tags = dict(kv.split('=', 1) for kv in xt.split(':') if '=' in kv)
            t['acont'] = t['acont'] or tags.get('acont')
            note = f.get('format_note') or ''
            if ' - ' in note:  # HLS rows carry the readable "<Language> - <kind>" label
                t['label'] = note.split(' - ', 1)[1]
        row = {'rank': rank, 'id': vid, 'status': 'ok', 'title': info.get('title'), 'upload_date': info.get('upload_date'),
               'duration': info.get('duration'), 'language': info.get('language'), 'views': info.get('view_count'),
               'audio': tracks, 'chapters': len(info.get('chapters') or [])}
        log.write(json.dumps(row, ensure_ascii=False) + '\n'); log.flush()
        print(rank, vid, len(tracks), flush=True)
        time.sleep(random.uniform(2.5, 4.5))
