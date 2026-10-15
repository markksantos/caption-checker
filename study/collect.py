#!/usr/bin/env python3
"""Collect public caption files for the caption reading-speed study.

NASA: every video in images-api.nasa.gov dated 2025+, seeded random sample of 250, the .srt NASA attaches.
MIT OCW: seeded random courses from the sitemap index that have a video gallery, up to 6 lecture .vtt files each,
until 250 files. Writes files under nasa/ and ocw/ plus manifest.json (source, id, title, url, date/course).
"""
import concurrent.futures as cf, json, os, random, re, sys, time, urllib.parse, urllib.request

D = os.path.dirname(os.path.abspath(__file__))
UA = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36'}
N = 250
rng = random.Random(20261015)


def get(u, raw=False, tries=3):
    for k in range(tries):
        try:
            r = urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=40).read()
            return r if raw else json.loads(r)
        except Exception as e:  # noqa: BLE001
            if k == tries - 1:
                raise
            time.sleep(2 + 2 * k)


def nasa():
    items, page = [], 1
    while True:
        d = get(f'https://images-api.nasa.gov/search?media_type=video&year_start=2025&page_size=100&page={page}')
        got = d['collection']['items']
        items += [it['data'][0] for it in got]
        if len(got) < 100:
            break
        page += 1
    seen, uniq = set(), []
    for x in items:
        if x['nasa_id'] not in seen:
            seen.add(x['nasa_id']); uniq.append(x)
    print('nasa population', len(uniq), flush=True)
    rng.shuffle(uniq)
    out = []

    def one(x):
        nid = x['nasa_id']
        a = get('https://images-api.nasa.gov/asset/' + urllib.parse.quote(nid))
        caps = [i['href'] for i in a['collection']['items'] if i['href'].lower().endswith('.srt')]
        if not caps:
            return None
        url = urllib.parse.quote(caps[0], safe=':/%')
        body = get(url, raw=True)
        fn = 'nasa/' + re.sub(r'[^A-Za-z0-9._-]+', '_', nid)[:80] + '.srt'
        open(os.path.join(D, fn), 'wb').write(body)
        return {'source': 'nasa', 'id': nid, 'title': x.get('title', ''), 'date': x.get('date_created', '')[:10],
                'center': x.get('center', ''), 'url': url, 'file': fn}

    with cf.ThreadPoolExecutor(6) as ex:
        for i in range(0, len(uniq), 30):
            for r in ex.map(lambda x: (lambda: one(x))() if True else None, uniq[i:i + 30]):
                if r:
                    out.append(r)
            print('nasa files', len(out), flush=True)
            if len(out) >= N:
                break
    return out[:N]


def ocw():
    idx = get('https://ocw.mit.edu/sitemap.xml', raw=True).decode()
    courses = re.findall(r'<loc>(https://ocw\.mit\.edu/courses/[^<]+)/sitemap\.xml</loc>', idx)
    print('ocw courses', len(courses), flush=True)
    rng.shuffle(courses)
    out, used = [], 0

    def course(c):
        sm = get(c + '/sitemap.xml', raw=True).decode()
        gal = [u for u in re.findall(r'<loc>([^<]+)</loc>', sm) if '/video_galleries/' in u and 'video' in u.rsplit('/video_galleries/', 1)[1]]
        if not gal:
            return []
        page = get(gal[0], raw=True).decode(errors='ignore')
        res = []
        for h in re.findall(r'href="(/courses/[^"]+/resources/[^"]+/)"', page):
            if h not in res:
                res.append(h)
        files = []
        for h in res[:6]:
            p = get('https://ocw.mit.edu' + h, raw=True).decode(errors='ignore')
            v = re.search(r'(?:href|src)="(/courses/[^"]+\.vtt)"', p)
            if not v:
                continue
            body = get('https://ocw.mit.edu' + v.group(1), raw=True)
            slug = c.rsplit('/', 1)[-1]
            fn = 'ocw/' + (slug[:50] + '__' + h.rstrip('/').rsplit('/', 1)[-1][:40]) + '.vtt'
            open(os.path.join(D, fn), 'wb').write(body)
            files.append({'source': 'ocw', 'id': h, 'course': slug, 'url': 'https://ocw.mit.edu' + v.group(1),
                          'page': 'https://ocw.mit.edu' + h, 'file': fn})
        return files

    with cf.ThreadPoolExecutor(4) as ex:
        for i in range(0, len(courses), 12):
            for fs in ex.map(lambda c: (lambda: course(c))(), courses[i:i + 12]):
                if fs:
                    used += 1
                    out += fs
            print('ocw files', len(out), 'from courses', used, flush=True)
            if len(out) >= N:
                break
    return out[:N]


if __name__ == '__main__':
    os.makedirs(os.path.join(D, 'nasa'), exist_ok=True)
    os.makedirs(os.path.join(D, 'ocw'), exist_ok=True)
    which = sys.argv[1:] or ['nasa', 'ocw']
    man = {}
    for w in which:
        man[w] = globals()[w]()
        json.dump(man, open(os.path.join(D, 'manifest-%s.json' % '-'.join(which)), 'w'), indent=1)
    print('done', {k: len(v) for k, v in man.items()}, flush=True)
