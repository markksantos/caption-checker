"""How long are YouTube videos now? For each channel in Wikipedia's most-subscribed list (same list and revision as the
caption and dubbing studies, ../study-auto-captions/coverage-channels.json): the latest 30 entries of its Videos tab with their
durations (flat listing, one request), the latest 30 Shorts ids, the latest 30 live-stream ids, and the channel's RSS feed
(its 15 latest uploads of any kind, with publish dates), so each recent upload can be classed as a video, a Short or a stream.
python3 collect.py   -> length.jsonl (one row per channel; resumable, failed channels are retried on a re-run)"""
import json, random, re, time
from pathlib import Path
from urllib.request import Request, urlopen
from yt_dlp import YoutubeDL

HERE = Path(__file__).parent
CH = json.loads((HERE.parent / 'study-auto-captions' / 'coverage-channels.json').read_text())['channels']
OUT = HERE / 'length.jsonl'
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36'
done = set()
if OUT.exists():
    done = {json.loads(l)['rank'] for l in OUT.read_text().splitlines() if json.loads(l)['status'] == 'ok'}


def tab(ydl, url, name):
    try:
        info = ydl.extract_info(f'{url}/{name}', download=False)
    except Exception as ex:
        return None, [], str(ex)[:120]
    es = [e for e in (info.get('entries') or []) if e and e.get('id')]
    return info, [{'id': e['id'], 'duration': e.get('duration'), 'views': e.get('view_count'), 'title': e.get('title')} for e in es], None


def rss(channel_id):
    req = Request(f'https://www.youtube.com/feeds/videos.xml?channel_id={channel_id}', headers={'User-Agent': UA})
    x = urlopen(req, timeout=30).read().decode('utf-8', 'ignore')
    return [{'id': m.group(1), 'published': m.group(2)} for m in re.finditer(r'<yt:videoId>([^<]+)</yt:videoId>.*?<published>([^<]+)</published>', x, re.S)]


with YoutubeDL({'quiet': True, 'no_warnings': True, 'skip_download': True, 'extract_flat': 'in_playlist', 'playlistend': 30}) as ydl, OUT.open('a') as log:
    for c in CH:
        if c['rank'] in done:
            continue
        info, videos, err = tab(ydl, c['url'], 'videos')
        if err or not info:
            log.write(json.dumps({'rank': c['rank'], 'status': 'error', 'error': err}) + '\n'); log.flush(); continue
        _, shorts, _ = tab(ydl, c['url'], 'shorts')
        _, streams, _ = tab(ydl, c['url'], 'streams')
        cid = info.get('channel_id') or info.get('uploader_id') or info.get('id')
        try:
            feed = rss(cid) if cid and cid.startswith('UC') else []
        except Exception as ex:
            feed = []; err = f'rss: {str(ex)[:80]}'
        row = {'rank': c['rank'], 'status': 'ok', 'channel_id': cid, 'videos': videos, 'shorts': [s['id'] for s in shorts],
               'streams': [s['id'] for s in streams], 'rss': feed, 'note': err}
        log.write(json.dumps(row, ensure_ascii=False) + '\n'); log.flush()
        print(c['rank'], c['name'][:30], len(videos), len(shorts), len(streams), len(feed), flush=True)
        time.sleep(random.uniform(2.0, 4.0))
