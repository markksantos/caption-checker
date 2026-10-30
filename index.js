'use strict';
/**
 * caption-checker: check SRT and WebVTT captions against published caption standards.
 * Online version: https://www.markstudios.com/tools/caption-checker
 *
 * Every limit below was read on the standard's own page on 2026-10-15 (see SOURCES).
 * Characters count spaces and punctuation, not line breaks or formatting tags.
 * Reading speed = characters ÷ (out-time − in-time). Words are runs of characters that hold a letter or a digit.
 * Gaps run from one caption's out-time to the next caption's in-time.
 */

const SOURCES = {
  netflix: 'https://partnerhelp.netflixstudios.com/hc/en-us/articles/217350977-English-USA-Timed-Text-Style-Guide',
  netflixGeneral: 'https://partnerhelp.netflixstudios.com/hc/en-us/articles/215758617-Timed-Text-Style-Guide-General-Requirements',
  netflixTiming: 'https://partnerhelp.netflixstudios.com/hc/en-us/articles/360051554394-Timed-Text-Style-Guide-Subtitle-Timing-Guidelines',
  bbc: 'https://www.bbc.co.uk/accessibility/forproducts/guides/subtitles/',
  dcmpText: 'https://dcmp.org/learn/597-captioning-key---text',
  dcmpRate: 'https://dcmp.org/learn/601-captioning-key---presentation-rate',
};

const NETFLIX = { nameShort: 'Netflix', cpl: 42, lines: 2, minDur: 5 / 6, minDurLabel: '5/6 of a second', maxDur: 7, gapFrames: 2, chainBelow: 0.5 };
const DCMP = { nameShort: 'DCMP', lines: 2, linesSeverity: 'advice', minDur: 40 / 30, minDurLabel: '40 frames, 1 second and 10 frames', maxDur: 6 };

const STANDARDS = {
  netflix: { ...NETFLIX, id: 'netflix', name: 'Netflix English, adult programs', cps: 20, speedNote: 'limit 20' },
  'netflix-kids': { ...NETFLIX, id: 'netflix-kids', name: 'Netflix English, children’s programs', cps: 17, speedNote: 'limit 17' },
  bbc: { id: 'bbc', name: 'BBC subtitle guidelines', nameShort: 'the BBC', cpl: 37, lines: 2, linesVertical: 3, wpm: 180,
         speedNote: 'the BBC recommends 160–180', secPerWord: 0.3, gapMinSeconds: 1 },
  'dcmp-upper': { ...DCMP, id: 'dcmp-upper', name: 'DCMP Captioning Key, upper level', wpm: 160, speedNote: 'limit 160' },
  'dcmp-middle': { ...DCMP, id: 'dcmp-middle', name: 'DCMP Captioning Key, middle level', wpm: 140, speedNote: 'limit 140' },
  'dcmp-lower': { ...DCMP, id: 'dcmp-lower', name: 'DCMP Captioning Key, lower level', wpm: 130, speedNote: 'limit 130' },
};

const TIMING = /^\s*((?:\d+:)?\d{1,2}:\d{1,2}[,.]\d{1,3})\s*-->\s*((?:\d+:)?\d{1,2}:\d{1,2}[,.]\d{1,3})/;

/** Seconds from "00:01:02,345", "01:02.345" or "1:02:03.4"; NaN if unreadable. */
function stamp(t) {
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})[,.](\d{1,3})$/.exec(String(t).trim());
  if (!m) return NaN;
  return (+(m[1] || 0)) * 3600 + (+m[2]) * 60 + (+m[3]) + (+(m[4] + '00').slice(0, 3)) / 1000;
}

function cleanLine(line) {
  return line.replace(/\{\\[^}]*\}/g, '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+$/, '');
}

const len = (t) => Array.from(t).length;
function countWords(t) {
  let n = 0;
  for (const p of t.trim().split(/\s+/)) if (/[\p{L}\p{N}]/u.test(p)) n++;
  return n;
}

const normalize = (src) => String(src).replace(/^﻿/, '').replace(/\r\n?/g, '\n');

/**
 * Split normalized text into blocks, keeping the blank-line separators at the odd indices of `parts`,
 * and find each cue block's timing line. Lines `first`..`last` (exclusive) of a block are its non-blank ones.
 */
function scan(text) {
  const parts = text.split(/(\n[ \t]*\n)/);
  const blocks = [];
  const skipped = [];
  for (let at = 0; at < parts.length; at += 2) {
    const lines = parts[at].split('\n');
    let first = 0, last = lines.length;
    while (first < last && !lines[first].trim()) first++;
    while (last > first && !lines[last - 1].trim()) last--;
    if (first === last || /^(WEBVTT|NOTE|STYLE|REGION)\b/.test(lines[first].trim())) continue;
    let timing = -1;
    for (let i = first; i < Math.min(last, first + 3); i++) if (lines[i].includes('-->')) { timing = i; break; }
    if (timing < 0) { skipped.push(lines[first].trim().slice(0, 60)); continue; }
    blocks.push({ at, lines, first, timing, last });
  }
  return { parts, blocks, skipped };
}

/**
 * Parse SRT or WebVTT text.
 * @returns {{cues: Array<{n:number,id:string,start:number,end:number,raw:string,lines:string[]}>, skipped: string[], vtt: boolean}}
 */
function parse(src) {
  const text = normalize(src);
  const vtt = /^WEBVTT\b/.test(text.trim());
  const { blocks, skipped } = scan(text);
  const cues = blocks.map(({ lines, first, timing, last }, i) => {
    const m = TIMING.exec(lines[timing]);
    return {
      n: i + 1,
      id: timing > first ? lines[first].trim() : '',
      start: m ? stamp(m[1]) : NaN,
      end: m ? stamp(m[2]) : NaN,
      raw: lines[timing].trim(),
      lines: lines.slice(timing + 1, last).map(cleanLine).filter((l) => l.trim() !== ''),
    };
  });
  return { cues, skipped, vtt };
}

function standardOf(standard) {
  const S = typeof standard === 'string' ? STANDARDS[standard] : standard;
  if (!S) throw new Error('Unknown standard: ' + standard + ' (use one of ' + Object.keys(STANDARDS).join(', ') + ')');
  return S;
}

const r1 = (x) => (Math.round(x * 10) / 10).toFixed(1);
const r0 = (x) => r1(x).replace(/\.0$/, '');
const r2 = (x) => (Math.round(x * 100) / 100).toFixed(2);

/**
 * Check parsed cues against a standard.
 * @param {string|object} standard  a key of STANDARDS or a standard object
 * @param {{fps?: number, vertical?: boolean}} [opts]  fps is used for frame gaps (default 24)
 * @returns {{standard: object, cues: object[], flagged: number, advisoryOnly: number, counts: object, stats: object}}
 */
function check(parsed, standard = 'netflix', opts = {}) {
  const S = standardOf(standard);
  const cues = (parsed.cues || parsed).map((c) => ({ ...c, issues: [] }));
  const rate = opts.fps || 24;
  const frame = 1 / rate;
  const maxLines = opts.vertical && S.linesVertical ? S.linesVertical : S.lines;
  const counts = {};
  let charsAll = 0, durAll = 0, maxCps = 0, maxWpm = 0, longest = 0;
  const add = (c, kind, severity, message) => { c.issues.push({ kind, severity, message }); counts[kind] = (counts[kind] || 0) + 1; };

  cues.forEach((c, i) => {
    const next = cues[i + 1], prev = cues[i - 1];
    if (!Number.isFinite(c.start) || !Number.isFinite(c.end)) { add(c, 'timing', 'limit', `The timing line can't be read: "${c.raw.slice(0, 60)}"`); return; }
    const dur = c.end - c.start;
    let chars = 0;
    const lens = c.lines.map((l) => { const n = len(l); chars += n; longest = Math.max(longest, n); return n; });
    const w = countWords(c.lines.join(' '));
    Object.assign(c, { duration: dur, chars, words: w });
    if (dur <= 0) add(c, 'timing', 'limit', 'Ends at or before it starts');
    if (prev && Number.isFinite(prev.start) && c.start < prev.start) add(c, 'timing', 'limit', 'Starts before the caption above it (out of order)');
    if (!c.lines.length) add(c, 'empty', 'limit', 'No text');
    if (next && Number.isFinite(next.start) && c.end > next.start + 0.0005) add(c, 'overlap', 'limit', `Overlaps the next caption by ${r2(c.end - next.start)} s`);
    if (dur > 0 && chars) {
      c.cps = chars / dur; c.wpm = (w / dur) * 60;
      charsAll += chars; durAll += dur; maxCps = Math.max(maxCps, c.cps); maxWpm = Math.max(maxWpm, c.wpm);
      if (S.cps && c.cps > S.cps + 1e-9) add(c, 'speed', 'limit', `Reading speed ${r1(c.cps)} characters a second (${S.speedNote})`);
      if (S.wpm && c.wpm > S.wpm + 1e-9) add(c, 'speed', 'limit', `${Math.round(c.wpm)} words a minute (${S.speedNote})`);
      if (S.secPerWord && w && dur < S.secPerWord * w - 1e-9)
        add(c, 'short', 'advice', `On screen ${r2(dur)} s for ${w} ${w === 1 ? 'word' : 'words'}; ${S.nameShort} suggests about ${S.secPerWord} s a word (${r1(S.secPerWord * w)} s)`);
    }
    if (S.cpl) lens.forEach((n, j) => { if (n > S.cpl) add(c, 'cpl', 'limit', `Line ${j + 1} is ${n} characters (limit ${S.cpl})`); });
    if (maxLines && c.lines.length > maxLines)
      add(c, 'lines', S.linesSeverity || 'limit', `${c.lines.length} lines (${S.linesSeverity === 'advice' ? 'preferred' : 'limit'} ${maxLines})`);
    if (dur > 0 && S.minDur && dur < S.minDur - 0.0005) add(c, 'short', 'limit', `On screen ${r2(dur)} s (minimum ${S.minDurLabel})`);
    if (S.maxDur && dur > S.maxDur + 0.0005) add(c, 'long', 'limit', `On screen ${r2(dur)} s (maximum ${S.maxDur} s)`);
    if (next && Number.isFinite(next.start) && c.end <= next.start + 0.0005) {
      const gap = next.start - c.end, fr = gap / frame;
      if (S.gapFrames && fr < S.gapFrames - 0.01)
        add(c, 'gap', 'limit', `Gap to the next caption is ${r0(fr)} ${r0(fr) === '1' ? 'frame' : 'frames'} at ${rate} fps (minimum ${S.gapFrames})`);
      else if (S.chainBelow && fr > S.gapFrames + 0.3 && gap < S.chainBelow)
        add(c, 'gap', 'advice', `Gap of ${r2(gap)} s: ${S.nameShort} closes gaps under ${S.chainBelow} s to ${S.gapFrames} frames`);
      if (S.gapMinSeconds && gap > 0.0005 && gap < S.gapMinSeconds)
        add(c, 'gap', 'advice', `Gap of ${r2(gap)} s: ${S.nameShort} says a gap should be at least ${S.gapMinSeconds} s`);
    }
  });

  const flagged = cues.filter((c) => c.issues.some((x) => x.severity === 'limit')).length;
  const advisoryOnly = cues.filter((c) => c.issues.length && !c.issues.some((x) => x.severity === 'limit')).length;
  return {
    standard: S, cues, flagged, advisoryOnly, counts,
    stats: { captions: cues.length, averageCps: durAll ? charsAll / durAll : 0, maxCps, maxWpm, longestLine: longest },
  };
}

// A line should not end on one of these when it can be avoided: an article, preposition, conjunction,
// possessive, subject pronoun or auxiliary verb reads better at the start of the next line, with the words it belongs to.
const WEAK_END = new Set(['a', 'an', 'the', 'and', 'or', 'but', 'nor', 'so', 'of', 'to', 'in', 'on', 'at', 'by', 'for', 'with',
  'from', 'into', 'as', 'if', 'that', 'than', 'my', 'your', 'our', 'their', 'its', 'i', 'we', 'he', 'she', 'they',
  'is', 'are', 'was', 'were', 'am', 'be', 'been', 'has', 'have', 'had', 'will', 'would', 'can', 'could', 'should', 'do', 'does', 'did']);

/**
 * Lay words out in the fewest lines (up to maxLines) of at most cpl characters, breaking between words only.
 * Among layouts with that many lines it prefers breaks after punctuation, avoids breaks after a WEAK_END word,
 * and then picks the most even one. Returns null when the words don't fit.
 */
function wrap(words, maxLines, cpl) {
  const n = words.length;
  const width = (a, b) => len(cleanLine(words.slice(a, b).join(' ')));
  if (width(0, n) <= cpl) return [words.join(' ')];
  for (let count = 2; count <= maxLines; count++) {
    let best = null, bestCost = Infinity;
    const place = (cuts, from) => {
      if (cuts.length === count - 1) {
        const bounds = [0, ...cuts, n];
        const widths = bounds.slice(1).map((b, i) => width(bounds[i], b));
        if (Math.max(...widths) > cpl) return;
        let cost = Math.max(...widths) - Math.min(...widths);
        for (const k of cuts) {
          if (/[,.;:!?]["'”’)]?$/.test(words[k - 1])) cost -= 20;
          if (WEAK_END.has(words[k - 1].toLowerCase())) cost += 20;
        }
        if (cost < bestCost) { bestCost = cost; best = bounds; } // a tie keeps the shorter first line
        return;
      }
      for (let k = from; k <= n - (count - 1 - cuts.length); k++) { cuts.push(k); place(cuts, k + 1); cuts.pop(); }
    };
    place([], 1);
    if (best) return best.slice(1).map((b, i) => words.slice(best[i], b).join(' '));
  }
  return null;
}

/** Write seconds the way `like` is written: the same decimal separator, and hours when it had them (or when needed). */
function stampLike(sec, like) {
  const ms = Math.round(sec * 1000);
  const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
  const parts = like.split(':');
  const hw = parts.length === 3 ? parts[0].length : 0;
  const p2 = (x) => String(x).padStart(2, '0');
  return (hw || h ? String(h).padStart(hw || 2, '0') + ':' : '') + p2(m) + ':' + p2(s) +
    (like.includes(',') ? ',' : '.') + String(ms % 1000).padStart(3, '0');
}

const floorMs = (x) => Math.floor(x * 1000 + 1e-6) / 1000;
const ceilMs = (x) => Math.ceil(x * 1000 - 1e-6) / 1000;
const clock = (sec) => {
  const ms = Math.round(sec * 1000), h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000);
  return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(s).padStart(2, '0') + '.' + String(ms % 1000).padStart(3, '0');
};

/**
 * Fix what a standard's limits allow without changing a word or moving an in-time:
 * - lines over the character limit, or too many lines, are rewrapped (captions with formatting tags or two speakers are left alone);
 * - an out-time is pulled back off an overlap or a gap under the minimum, and cut to the longest time on screen;
 * - an out-time is pushed into free time when a caption is too short or reads too fast;
 * - for Netflix, a gap under 0.5 s is closed to the minimum, as its timing guide asks.
 * Every other byte of the file stays as it was (line endings and a byte-order mark included).
 * @param {string} src  SRT or WebVTT text
 * @param {{fps?: number, vertical?: boolean}} [opts]
 * @returns {{text: string, changes: Array<{n:number, what:string}>, unresolved: Array<{n:number, why:string}>, before: object, after: object}}
 */
function fix(src, standard = 'netflix', opts = {}) {
  const S = standardOf(standard);
  const raw = String(src);
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const bom = raw.startsWith('\uFEFF') ? '\uFEFF' : '';
  const text = normalize(raw);
  const { parts, blocks } = scan(text);
  const parsed = parse(text);
  const frame = 1 / (opts.fps || 24);
  const maxLines = opts.vertical && S.linesVertical ? S.linesVertical : S.lines;
  const minGap = S.gapFrames ? S.gapFrames * frame : 0;
  const changes = [], unresolved = [];
  const note = (list, n, key, value) => list.push({ n, [key]: value });

  parsed.cues.forEach((c, i) => {
    const b = blocks[i];
    let shown = c.lines;

    const wide = S.cpl && shown.some((l) => len(l) > S.cpl);
    const many = maxLines && S.linesSeverity !== 'advice' && shown.length > maxLines;
    if (wide || many) {
      const rawLines = b.lines.slice(b.timing + 1, b.last);
      const wrapped = /<[^>]*>|\{\\/.test(rawLines.join('\n')) || rawLines.some((l) => /^\s*-/.test(l)) ? undefined
        : wrap(rawLines.join(' ').trim().split(/\s+/), maxLines, S.cpl || Infinity);
      if (wrapped === undefined) note(unresolved, c.n, 'why', 'Has formatting tags or two speakers, so rewrap it by hand');
      else if (!wrapped) note(unresolved, c.n, 'why', `Too long for ${maxLines} lines of ${S.cpl} characters: split it into two captions or condense it`);
      else {
        b.lines.splice(b.timing + 1, rawLines.length, ...wrapped);
        b.last = b.timing + 1 + wrapped.length;
        shown = wrapped.map(cleanLine);
        note(changes, c.n, 'what', `Rewrapped to ${wrapped.length === 1 ? 'one line' : wrapped.length + ' lines'} (${shown.map(len).join(' + ')} characters)`);
      }
    }

    if (!Number.isFinite(c.start) || !(c.end > c.start)) {
      note(unresolved, c.n, 'why', 'Its timing line is unreadable or ends before it starts: fix it by hand');
      return;
    }
    const next = parsed.cues[i + 1];
    if (next && !(next.start >= c.start)) return; // the next caption's own check reports its timing
    const latest = next ? floorMs(next.start - minGap) : Infinity;
    if (latest <= c.start) {
      note(unresolved, c.n, 'why', `The next caption starts less than ${S.gapFrames} frames after this one: merge them or move one`);
      return;
    }
    const longest = S.maxDur ? c.start + S.maxDur : Infinity;
    const chars = shown.reduce((sum, l) => sum + len(l), 0), words = countWords(shown.join(' '));
    const readNeed = Math.max(S.cps && chars ? chars / S.cps : 0, S.wpm && words ? (words / S.wpm) * 60 : 0);
    const need = Math.max(S.minDur || 0, readNeed);
    let end = c.end;
    const why = [];
    if (end > latest + 0.0005) {
      why.push(c.end > next.start + 0.0005 ? 'off an overlap' : `to leave ${S.gapFrames} frames before the next caption`);
      end = latest;
    }
    if (end > longest + 0.0005) { end = longest; why.push(`to the ${S.maxDur} s maximum`); }
    if (end - c.start < need - 0.0005) {
      const target = Math.min(ceilMs(c.start + need), latest, longest);
      if (target > end + 0.0005) {
        end = target;
        why.push(readNeed >= (S.minDur || 0) ? 'to give it more time to be read' : 'toward the shortest time on screen');
      }
      const dur = end - c.start;
      if (dur < need - 0.0005) {
        const rate = S.cps ? `${r1(chars / dur)} characters a second` : `${Math.round((words / dur) * 60)} words a minute`;
        note(unresolved, c.n, 'why', readNeed >= (S.minDur || 0)
          ? `Still reads at ${rate} (${S.speedNote}) with no free time after it: split it, condense it or move the next caption`
          : `Still on screen only ${r2(dur)} s (minimum ${S.minDurLabel}) with no free time after it: merge it with a neighbor or move the next caption`);
      }
    }
    if (S.chainBelow && next && latest <= longest) {
      const gap = next.start - end;
      if (gap > minGap + 0.3 * frame && gap < S.chainBelow) { why.push(`closing a ${r2(gap)} s gap to ${S.gapFrames} frames`); end = latest; }
    }
    if (Math.abs(end - c.end) > 0.0005) {
      const line = b.lines[b.timing], arrow = line.indexOf('-->'), out = TIMING.exec(line)[2];
      b.lines[b.timing] = line.slice(0, arrow) + line.slice(arrow).replace(out, stampLike(end, out));
      note(changes, c.n, 'what', `Out-time ${clock(c.end)} -> ${clock(end)} (${why.join(', ')})`);
    }
  });

  for (const b of blocks) parts[b.at] = b.lines.join('\n');
  const fixed = bom + parts.join('').replace(/\n/g, eol);
  return { text: fixed, changes, unresolved, before: check(parsed, S, opts), after: check(parse(fixed), S, opts) };
}

module.exports = { parse, check, fix, wrap, stamp, STANDARDS, SOURCES };
