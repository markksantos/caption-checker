"""Caption coverage of the 100 most-subscribed YouTube channels (Wikipedia list): for each channel's latest regular uploads,
does the channel upload its own caption track (any language / English / its primary language), and does YouTube generate
automatic captions? python3 coverage.py [per_channel=5]  -> coverage-channels.json, coverage.jsonl (resumable)"""
import json, random, re, sys, time
from pathlib import Path
from urllib.request import Request, urlopen
from yt_dlp import YoutubeDL

HERE = Path(__file__).parent
PER = int(sys.argv[1]) if len(sys.argv) > 1 else 5
CH = HERE / 'coverage-channels.json'
OUT = HERE / 'coverage.jsonl'

if not CH.exists():
    req = Request('https://en.wikipedia.org/w/api.php?action=parse&page=List_of_most-subscribed_YouTube_channels&prop=wikitext|revid&format=json',
                  headers={'User-Agent': 'MarkStudiosResearch/1.0 (contact@markstudios.com)'})
    j = json.loads(urlopen(req).read())
    t = j['parse']['wikitext']['*']
    tbl = t[t.find('{|'):t.find('\n|}', t.find('{|'))]
    chans = []
    for row in tbl.split('|-'):
        m = re.search(r'\{\{plk\|(https?://www\.youtube\.com/[^|}]+)', row)
        if not m:
            continue
        cells = [c.strip() for c in row.strip().split('\n| ') if c.strip()]
        name = re.sub(r'\[\[(?:[^|\]]*\|)?([^\]]+)\]\]', r'\1', cells[0].lstrip('| ')).split('<ref')[0].strip()
        lang = re.sub(r'\[\[(?:[^|\]]*\|)?([^\]]+)\]\]', r'\1', cells[3]).split('<ref')[0].strip() if len(cells) > 3 else ''
        subs = re.match(r'[\d.]+', cells[2]).group(0) if len(cells) > 2 and re.match(r'[\d.]+', cells[2]) else ''
        chans.append({'rank': len(chans) + 1, 'name': name, 'url': m.group(1).rstrip('/'), 'subs_m': subs, 'language': lang})
    CH.write_text(json.dumps({'source_revid': j['parse'].get('revid'), 'fetched': time.strftime('%Y-%m-%d'), 'channels': chans}, indent=1, ensure_ascii=False))
chans = json.loads(CH.read_text())['channels']
done = {}
if OUT.exists():
    for line in OUT.read_text().splitlines():
        r = json.loads(line)
        done.setdefault(r['rank'], []).append(r)

with YoutubeDL({'quiet': True, 'no_warnings': True, 'skip_download': True}) as ydl, OUT.open('a') as log:
    for c in chans:
        if len([r for r in done.get(c['rank'], []) if r['status'] == 'ok']) >= PER or any(r['status'] == 'channel-error' for r in done.get(c['rank'], [])):
            continue
        try:
            flat = ydl.extract_info(c['url'] + '/videos', download=False, process=False)
            entries = [e for _, e in zip(range(30), flat['entries'])]
        except Exception as ex:
            log.write(json.dumps({'rank': c['rank'], 'status': 'channel-error', 'error': str(ex)[:150]}) + '\n'); log.flush()
            continue
        have = {r['id'] for r in done.get(c['rank'], []) if r['status'] == 'ok'}  # failed loads are retried on a re-run
        n = len([r for r in done.get(c['rank'], []) if r['status'] == 'ok'])
        for e in entries:
            if n >= PER:
                break
            if e['id'] in have or (e.get('duration') or 0) < 120:
                continue
            try:
                info = ydl.extract_info(f"https://www.youtube.com/watch?v={e['id']}", download=False)
            except Exception as ex:
                log.write(json.dumps({'rank': c['rank'], 'id': e['id'], 'status': 'error', 'error': str(ex)[:150]}) + '\n'); log.flush()
                continue
            subs = sorted(k for k in (info.get('subtitles') or {}) if k != 'live_chat')
            auto = info.get('automatic_captions') or {}
            row = {'rank': c['rank'], 'id': e['id'], 'status': 'ok', 'title': info.get('title'), 'upload_date': info.get('upload_date'),
                   'duration': info.get('duration'), 'language': info.get('language'), 'human_tracks': subs,
                   'auto_orig': sorted(k for k in auto if k.endswith('-orig')), 'live': bool(info.get('was_live'))}
            log.write(json.dumps(row, ensure_ascii=False) + '\n'); log.flush()
            n += 1
            print(c['rank'], c['name'], n, e['id'], len(subs), flush=True)
            time.sleep(random.uniform(2.5, 4.5))  # slower: the first run was throttled after ~75 channels
