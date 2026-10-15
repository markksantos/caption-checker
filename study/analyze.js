'use strict';
// Caption reading-speed study: run every collected caption file through caption-checker's own parse()/check().
// Usage: node study/analyze.js  -> prints results JSON, writes videos.csv (one row per video). Run study/collect.py first.
// Unit = one video. Duplicate copies (same caption text, or the same NASA title at 720p/1080p/4K) count once;
// files with fewer than 5 timed captions that hold text (music-only b-roll) are left out.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { parse, check } = require(process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, '..'));
const D = __dirname;

const man = [];
for (const f of fs.readdirSync(D).sort()) if (/^manifest-.*\.json$/.test(f)) for (const v of Object.values(JSON.parse(fs.readFileSync(path.join(D, f))))) man.push(...v);

const pct = (a, b) => (b ? (100 * a) / b : 0);
const quant = (xs, q) => { const s = [...xs].sort((a, b) => a - b); if (!s.length) return 0; const i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
const r1 = (x) => Math.round(x * 10) / 10;
const LIVE = /\blive\b|coverage|news conference|briefing|q&a|town hall|teleconference|media (?:day|telecon)|update\b|webinar|press conference/i;

const len = (l) => Array.from(l).length;
const PRED = {
  over20cps: (c) => c.cps > 20, over17cps: (c) => c.cps > 17,
  over180wpm: (c) => c.wpm > 180, over160wpm: (c) => c.wpm > 160, over140wpm: (c) => c.wpm > 140, over130wpm: (c) => c.wpm > 130,
  lineOver42: (c) => c.lines.some((l) => len(l) > 42), lineOver37: (c) => c.lines.some((l) => len(l) > 37),
  over2lines: (c) => c.lines.length > 2, oneLine: (c) => c.lines.length === 1,
  under5_6s: (c) => c.duration < 5 / 6 - 0.0005, under40frames: (c) => c.duration < 40 / 30 - 0.0005,
  over7s: (c) => c.duration > 7.0005, over6s: (c) => c.duration > 6.0005,
  gapUnder2Frames: (c) => c.issues.some((x) => x.kind === 'gap' && x.severity === 'limit'), overlap: (c) => c.issues.some((x) => x.kind === 'overlap'),
};

const seen = new Set();
let dupes = 0, tooShort = 0;
const videos = [];
for (const m of man) {
  const text = fs.readFileSync(path.join(D, m.file), 'utf8');
  const k1 = crypto.createHash('sha1').update(text.replace(/\s+/g, ' ')).digest('hex');
  const k2 = m.source + ':' + String(m.title || m.id).toLowerCase().replace(/\s*[-–]\s*(720p|1080p|4k|hd)\s*$/i, '').trim();
  if (seen.has(k1) || seen.has(k2)) { dupes++; continue; }
  seen.add(k1); seen.add(k2);
  const res = check(parse(text), 'netflix', { fps: 30 });
  const cues = res.cues.filter((c) => Number.isFinite(c.duration) && c.duration > 0 && c.chars > 0);
  if (cues.length < 5) { tooShort++; continue; }
  const v = { source: m.source, group: m.source === 'nasa' ? (LIVE.test(m.title || '') ? 'nasa-live' : 'nasa-produced') : 'ocw',
              id: m.id, title: m.title || m.course, date: m.date || '', url: m.url, page: m.page || '', captions: cues.length, share: {} };
  for (const [k, f] of Object.entries(PRED)) v.share[k] = pct(cues.filter(f).length, cues.length);
  const words = cues.reduce((a, c) => a + c.words, 0), shown = cues.reduce((a, c) => a + c.duration, 0);
  v.rateWpm = (words / shown) * 60;
  v.medianCps = quant(cues.map((c) => c.cps), 0.5);
  v.maxLine = Math.max(...cues.flatMap((c) => c.lines.map(len)));
  v.minutes = (cues[cues.length - 1].end - cues[0].start) / 60;
  videos.push(v);
}

function summary(vs) {
  const n = vs.length, o = { videos: n, captions: vs.reduce((a, v) => a + v.captions, 0), medianCaptions: quant(vs.map((v) => v.captions), 0.5),
    medianMinutes: r1(quant(vs.map((v) => v.minutes), 0.5)), medianOfMedianCps: r1(quant(vs.map((v) => v.medianCps), 0.5)),
    medianRateWpm: Math.round(quant(vs.map((v) => v.rateWpm), 0.5)), p25RateWpm: Math.round(quant(vs.map((v) => v.rateWpm), 0.25)), p75RateWpm: Math.round(quant(vs.map((v) => v.rateWpm), 0.75)),
    rateOver130: vs.filter((v) => v.rateWpm > 130).length, rateOver140: vs.filter((v) => v.rateWpm > 140).length, rateOver160: vs.filter((v) => v.rateWpm > 160).length, rateOver180: vs.filter((v) => v.rateWpm > 180).length,
    rateBands: [[0, 130], [130, 140], [140, 160], [160, 180], [180, Infinity]].map(([lo, hi]) => vs.filter((v) => v.rateWpm > lo && v.rateWpm <= hi).length),
    maxLineMedian: quant(vs.map((v) => v.maxLine), 0.5), maxLineMax: Math.max(...vs.map((v) => v.maxLine)), median: {}, any: {}, atLeast10: {}, none: {} };
  for (const k of Object.keys(PRED)) {
    o.median[k] = r1(quant(vs.map((v) => v.share[k]), 0.5));
    o.any[k] = vs.filter((v) => v.share[k] > 0).length;
    o.atLeast10[k] = vs.filter((v) => v.share[k] >= 10).length;
    o.none[k] = vs.filter((v) => v.share[k] === 0).length;
  }
  return o;
}
const out = { sampled: man.length, dupes, tooShort, nasa: summary(videos.filter((v) => v.source === 'nasa')),
  'nasa-produced': summary(videos.filter((v) => v.group === 'nasa-produced')), 'nasa-live': summary(videos.filter((v) => v.group === 'nasa-live')),
  ocw: summary(videos.filter((v) => v.source === 'ocw')), all: summary(videos),
  ocwCourses: new Set(videos.filter((v) => v.source === 'ocw').map((v) => v.title)).size,
  nasaDates: [videos.filter((v) => v.source === 'nasa').map((v) => v.date).sort()[0], videos.filter((v) => v.source === 'nasa').map((v) => v.date).sort().pop()] };

const q = (x) => /[",\n]/.test(String(x)) ? '"' + String(x).replace(/"/g, '""') + '"' : x;
const head = ['source', 'group', 'title_or_course', 'date', 'captions', 'minutes', 'words_per_minute_overall', 'median_chars_per_second',
  'pct_over_20cps', 'pct_over_160wpm', 'pct_line_over_42', 'pct_under_5_6s', 'pct_over_7s', 'pct_gap_under_2_frames', 'longest_line', 'caption_file_url'];
const rows = videos.map((v) => [v.source, v.group, v.title, v.date, v.captions, v.minutes.toFixed(1), v.rateWpm.toFixed(0), v.medianCps.toFixed(1),
  v.share.over20cps.toFixed(1), v.share.over160wpm.toFixed(1), v.share.lineOver42.toFixed(1), v.share.under5_6s.toFixed(1), v.share.over7s.toFixed(1),
  v.share.gapUnder2Frames.toFixed(1), v.maxLine, v.url].map(q).join(','));
fs.writeFileSync(path.join(D, 'videos.csv'), [head.join(','), ...rows].join('\n') + '\n');
fs.writeFileSync(path.join(D, 'results.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
