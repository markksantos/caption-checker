"""Category and country for each channel, from the same Wikipedia revision the coverage sample used
(study-auto-captions/coverage-channels.json source_revid), matched by rank in table order.
python3 channels_meta.py  -> channels-meta.json"""
import json, re
from pathlib import Path
from urllib.request import Request, urlopen

HERE = Path(__file__).parent
ch = json.loads((HERE.parent / 'study-auto-captions' / 'coverage-channels.json').read_text())
req = Request(f"https://en.wikipedia.org/w/api.php?action=parse&oldid={ch['source_revid']}&prop=wikitext&format=json",
              headers={'User-Agent': 'MarkStudiosResearch/1.0 (contact@markstudios.com)'})
t = json.loads(urlopen(req).read())['parse']['wikitext']['*']
tbl = t[t.find('{|'):t.find('\n|}', t.find('{|'))]


def plain(cell):
    cell = re.sub(r'<ref[^>]*/>', '', cell)
    cell = re.sub(r'<ref[^>]*>.*?</ref>', '', cell, flags=re.S)
    cell = re.sub(r'\{\{flag(?:icon)?\|([^|}]+)[^}]*\}\}', r'\1', cell)
    cell = re.sub(r'\[\[(?:[^|\]]*\|)?([^\]]+)\]\]', r'\1', cell)
    cell = re.sub(r'\{\{[^}]*\}\}', '', cell)
    return cell.lstrip('| ').strip()


out, rank = {}, 0
for row in tbl.split('|-'):
    m = re.search(r'\{\{plk\|(https?://www\.youtube\.com/[^|}]+)', row)
    if not m:
        continue
    rank += 1
    cells = [c for c in row.strip().split('\n| ') if c.strip()]
    url = m.group(1).rstrip('/')
    assert url == ch['channels'][rank - 1]['url'], (rank, url)
    out[rank] = {'category': plain(cells[4]) if len(cells) > 4 else '', 'country': plain(cells[6]) if len(cells) > 6 else ''}
(HERE / 'channels-meta.json').write_text(json.dumps(out, indent=1, ensure_ascii=False))
from collections import Counter
print(len(out), Counter(v['category'] for v in out.values()).most_common())
