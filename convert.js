'use strict';

// Convert captions between SubRip (.srt) and WebVTT (.vtt), and retime them: an offset, a new start for one caption,
// a frame-rate change, or a two-point sync. Times are integer milliseconds, so nothing drifts from rounding. Built on
// subtitles.js, the same reader and writer as the online SRT/VTT converter and subtitle time shifter.

const S = require('./subtitles.js');

const plural = (k, one, many) => k + ' ' + (k === 1 ? one : many);

// What write() changed or left out, in words, for each count it reports.
const NOTES = {
  positions: (k, to) => to === 'vtt'
    ? plural(k, 'position code', 'position codes') + ' ({\\an8} and the like) became WebVTT line and align settings.'
    : plural(k, 'WebVTT line or align setting', 'WebVTT line or align settings') + ' became {\\anN} position codes.',
  font: (k) => plural(k, 'font colour tag', 'font colour tags') + ' removed: WebVTT has no font tag (colours go in ::cue CSS instead).',
  ass: (k) => plural(k, 'other {\\…} override code', 'other {\\…} override codes') + ' removed.',
  tags: (k) => plural(k, 'other tag', 'other tags') + ' removed. Italic, bold and underline are kept.',
  voice: (k, to, speakers) => plural(k, 'voice tag', 'voice tags') + ' (<v Name>) ' + (speakers ? 'turned into "Name: " at the start of the line.' : 'removed; pass speakers to write them as "Name: ".'),
  ruby: (k) => plural(k, 'ruby annotation', 'ruby annotations') + ' removed.',
  karaoke: (k) => plural(k, 'inline timestamp', 'inline timestamps') + ' (karaoke timing) removed.',
  ids: (k) => plural(k, 'WebVTT cue name', 'WebVTT cue names') + ' replaced by caption numbers.',
  meta: (k, to) => to === 'srt'
    ? plural(k, 'NOTE, STYLE or REGION block', 'NOTE, STYLE or REGION blocks') + ' left out: SubRip has no place for them.'
    : plural(k, 'header block', 'header blocks') + ' left out.',
  settings: (k) => plural(k, 'caption', 'captions') + ' had WebVTT settings with no SubRip equivalent (position, size, region or vertical); those settings were dropped.',
  reordered: () => 'Captions put in start-time order, as WebVTT requires.',
  untimed: (k) => plural(k, 'caption', 'captions') + ' with an unreadable timing line skipped.',
  empty: (k) => plural(k, 'empty caption', 'empty captions') + ' dropped: SubRip needs text in every caption.',
  clamped: (k) => plural(k, 'caption', 'captions') + ' would have started before 0:00, so the times were clamped to 00:00:00,000. Check them against the video.',
};
const explain = (counts, to, speakers) => Object.keys(NOTES).filter((k) => counts[k]).map((k) => NOTES[k](counts[k], to, speakers));

// "1.25", "-0.5", "1,25", "1:02.5", "00:01:02,345", "2m30s", "1h2m3.5s", "750ms" → milliseconds (NaN if unreadable)
function parseTime(str) {
  if (typeof str === 'number') return Number.isFinite(str) ? Math.round(str * 1000) : NaN;  // a number is seconds
  let s = String(str || '').trim().replace(/\s+/g, ''), sign = 1, m;
  if (!s) return NaN;
  if (s[0] === '-' || s[0] === '−') { sign = -1; s = s.slice(1); } else if (s[0] === '+') s = s.slice(1);
  if ((m = /^(\d+(?:[.,]\d+)?)$/.exec(s))) return sign * Math.round(parseFloat(m[1].replace(',', '.')) * 1000);
  if ((m = /^(?:(\d+):)?(\d+):(\d+)(?:[.,](\d{1,3}))?$/.exec(s)))
    return sign * ((+(m[1] || 0)) * 3600000 + (+m[2]) * 60000 + (+m[3]) * 1000 + (m[4] ? +(m[4] + '00').slice(0, 3) : 0));
  if ((m = /^(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m(?!s))?(?:(\d+(?:\.\d+)?)s)?(?:(\d+)ms)?$/i.exec(s)) && s)
    return sign * Math.round((+(m[1] || 0)) * 3600000 + (+(m[2] || 0)) * 60000 + (+(m[3] || 0)) * 1000 + (+(m[4] || 0)));
  return NaN;
}

const human = (ms) => {  // 1250 → "1.250 s", 83456 → "1:23.456"
  ms = Math.abs(ms);
  return ms < 60000 ? (ms / 1000).toFixed(3) + ' s' : S.ts(ms, 'srt').replace(/^00:/, '').replace(',', '.');
};

// A caption file's bytes as text: UTF-16 by its byte-order mark, UTF-8 when it decodes cleanly, otherwise Windows-1252,
// which SubRip itself writes by default (the same rule as the online tools). Returns { text, encoding }.
function decode(bytes) {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (buf[0] === 0xFF && buf[1] === 0xFE) return { text: new TextDecoder('utf-16le').decode(buf).replace(/^\uFEFF/, ''), encoding: 'UTF-16' };
  if (buf[0] === 0xFE && buf[1] === 0xFF) return { text: new TextDecoder('utf-16be').decode(buf).replace(/^\uFEFF/, ''), encoding: 'UTF-16' };
  try { return { text: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buf), encoding: 'UTF-8' }; }  // ignoreBOM keeps the mark, so --fix can keep it
  catch (e) { return { text: new TextDecoder('windows-1252').decode(buf), encoding: 'Windows-1252' }; }
}

function read(src, name) {
  const p = S.parse(String(src), name);
  const timed = p.cues.filter((c) => Number.isFinite(c.startMs));
  if (!timed.length) throw new Error('No captions found. Each caption needs a timing line like 00:00:01,000 --> 00:00:03,500.');
  return { p, timed };
}

function format(to, p) {
  if (to === undefined || to === 'same') return p.kind;
  if (to !== 'srt' && to !== 'vtt') throw new Error('to must be srt or vtt');
  return to;
}

function lineEnd(eol) {
  if (eol === undefined || eol === '\n' || eol === '\r\n') return eol;
  if (eol === 'lf') return '\n';
  if (eol === 'crlf') return '\r\n';
  throw new Error('eol must be lf or crlf');
}

/**
 * Convert SubRip to WebVTT or back. src: the file's text. to: 'srt' | 'vtt' (default: the other format).
 * opts: keepIds (SRT→VTT caption numbers become cue ids, default true), speakers (VTT→SRT: <v Name> becomes "Name: "),
 * eol ('lf' | 'crlf', default the source's), name (a file name, used only when the text alone can't tell the format).
 * Returns { text, from, to, captions, notes: [what changed, in words], counts }.
 */
function convert(src, to, opts = {}) {
  const { p } = read(src, opts.name);
  const kind = to === undefined ? (p.kind === 'srt' ? 'vtt' : 'srt') : format(to, p);
  const res = S.write(p, kind, { keepIds: opts.keepIds !== false, speakers: opts.speakers === true, eol: lineEnd(opts.eol) });
  return { text: res.text, from: p.kind, to: kind, captions: res.count, notes: explain(res.notes, kind, opts.speakers === true), counts: res.notes };
}

// Frame-rate pairs a two-point sync often turns out to be.
const KNOWN = [[23.976, 25], [25, 23.976], [24, 25], [25, 24], [23.976, 24], [24, 23.976], [29.97, 25], [25, 29.97], [29.97, 30], [30, 29.97], [24, 29.97], [29.97, 24]];

function plan(how, timed) {
  const nth = (n, what) => {
    const c = Number.isInteger(n) && n >= 1 ? timed[n - 1] : undefined;
    if (!c) throw new Error(`${what}: there is no caption ${n} in this file (it has ${timed.length}).`);
    return c;
  };
  const time = (t, what) => {
    const ms = parseTime(t);
    if (!Number.isFinite(ms)) throw new Error(`${what}: can't read "${t}" as a time. Use 1.5, -0:02.250, 00:01:02,345, 2m30s or 750ms.`);
    return ms;
  };
  const modes = ['offset', 'startAt', 'rate', 'sync'].filter((k) => how[k] !== undefined);
  if (modes.length !== 1) throw new Error('Pass exactly one of offset, startAt, rate or sync.');

  if (how.offset !== undefined) {
    const off = time(how.offset, 'offset'), from = how.from === undefined ? 1 : how.from;
    if (!Number.isInteger(from) || from < 1) throw new Error('from must be a caption number, 1 or more.');
    return { fn: (c) => (c.n >= from ? [c.startMs + off, c.endMs + off] : [c.startMs, c.endMs]), offsetMs: off,
             say: 'moved ' + human(off) + ' ' + (off < 0 ? 'earlier' : 'later') + (from > 1 ? ', from caption ' + from + ' on' : '') };
  }
  if (how.startAt !== undefined) {
    const c0 = nth(how.startAt.caption, 'startAt'), at = time(how.startAt.time, 'startAt'), o = at - c0.startMs;
    const from = how.from === undefined ? 1 : how.from;
    if (!Number.isInteger(from) || from < 1) throw new Error('from must be a caption number, 1 or more.');
    return { fn: (c) => (c.n >= from ? [c.startMs + o, c.endMs + o] : [c.startMs, c.endMs]), offsetMs: o,
             say: 'moved ' + human(o) + ' ' + (o < 0 ? 'earlier' : 'later') + ' so caption ' + c0.n + ' starts at ' + S.ts(at, 'srt') + (from > 1 ? ', from caption ' + from + ' on' : '') };
  }
  if (how.rate !== undefined) {
    const a = +how.rate.from, b = +how.rate.to;
    if (!(a > 0 && b > 0)) throw new Error('rate needs the frame rate the captions were timed for (from) and the video\'s frame rate (to).');
    if (a === b) throw new Error('The two frame rates are the same, so nothing would change.');
    const k = a / b;
    return { fn: (c) => [c.startMs * k, c.endMs * k], scale: k, say: 'rescaled from ' + a + ' fps to ' + b + ' fps: every time × ' + k.toFixed(6) };
  }
  if (!Array.isArray(how.sync) || how.sync.length !== 2) throw new Error('sync needs two points, each { caption, time }.');
  const A = nth(how.sync[0].caption, 'sync'), B = nth(how.sync[1].caption, 'sync');
  const ta = time(how.sync[0].time, 'sync'), tb = time(how.sync[1].time, 'sync');
  if (A === B || A.startMs === B.startMs) throw new Error('Pick two captions that start at different times, ideally one near the start and one near the end.');
  const r = (tb - ta) / (B.startMs - A.startMs);
  if (r <= 0) throw new Error('The second caption has to start after the first one.');
  const match = KNOWN.find((x) => Math.abs(r - x[0] / x[1]) < 0.0006);
  return { fn: (c) => [ta + (c.startMs - A.startMs) * r, ta + (c.endMs - A.startMs) * r], scale: r,
           hint: match ? `That matches captions timed for ${match[0]} fps on a ${match[1]} fps video.` : '',
           say: 'resynced on two points: caption ' + A.n + ' → ' + S.ts(ta, 'srt') + ', caption ' + B.n + ' → ' + S.ts(tb, 'srt') + ' (every gap × ' + r.toFixed(6) + ')' };
}

/**
 * Retime captions. how: exactly one of
 *   offset: '1.5' | '-0:02.250' | '750ms' | seconds as a number, with optional from: N (leave captions before N alone);
 *   startAt: { caption: N, time } (move the file so caption N starts at time), with optional from;
 *   rate: { from: 23.976, to: 25 } (captions timed for one frame rate on a video at another; every time × from ÷ to);
 *   sync: [{ caption, time }, { caption, time }] (pin two captions to their right start times, stretch the rest).
 * Also: to ('srt' | 'vtt', default the source's format), eol, keepIds, speakers, name, as for convert().
 * Text, numbering, cue ids and WebVTT settings are kept; times that would fall before 0:00 are clamped and counted.
 * Returns { text, from, to, captions, changed, clamped, summary, notes, counts, scale?, offsetMs? }.
 */
function retime(src, how = {}) {
  const { p, timed } = read(src, how.name);
  const pl = plan(how, timed);
  const kind = format(how.to, p);
  const res = S.write(p, kind, { times: pl.fn, keepIds: how.keepIds !== false, speakers: how.speakers === true, eol: lineEnd(how.eol) });
  const changed = timed.filter((c) => { const x = pl.fn(c); return Math.round(x[0]) !== c.startMs || Math.round(x[1]) !== c.endMs; }).length;
  const out = {
    text: res.text, from: p.kind, to: kind, captions: timed.length, changed, clamped: res.notes.clamped || 0,
    summary: `${changed} of ${timed.length} captions ${pl.say}.` + (pl.hint ? ' ' + pl.hint : ''),
    notes: explain(res.notes, kind, how.speakers === true), counts: res.notes,
  };
  if (pl.scale !== undefined) out.scale = pl.scale;
  if (pl.offsetMs !== undefined) out.offsetMs = pl.offsetMs;
  return out;
}

module.exports = { convert, retime, parseTime, decode };
