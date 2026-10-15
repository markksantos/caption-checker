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

/**
 * Parse SRT or WebVTT text.
 * @returns {{cues: Array<{n:number,id:string,start:number,end:number,raw:string,lines:string[]}>, skipped: string[], vtt: boolean}}
 */
function parse(src) {
  const text = String(src).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const vtt = /^WEBVTT\b/.test(text.trim());
  const cues = [];
  const skipped = [];
  for (const block of text.split(/\n[ \t]*\n/)) {
    const lines = block.split('\n');
    while (lines.length && !lines[0].trim()) lines.shift();
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    if (!lines.length || /^(WEBVTT|NOTE|STYLE|REGION)\b/.test(lines[0].trim())) continue;
    let ti = -1;
    for (let i = 0; i < Math.min(lines.length, 3); i++) if (lines[i].includes('-->')) { ti = i; break; }
    if (ti < 0) { skipped.push(lines[0].trim().slice(0, 60)); continue; }
    const m = TIMING.exec(lines[ti]);
    cues.push({
      n: cues.length + 1,
      id: ti > 0 ? lines[0].trim() : '',
      start: m ? stamp(m[1]) : NaN,
      end: m ? stamp(m[2]) : NaN,
      raw: lines[ti].trim(),
      lines: lines.slice(ti + 1).map(cleanLine).filter((l) => l.trim() !== ''),
    });
  }
  return { cues, skipped, vtt };
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
  const S = typeof standard === 'string' ? STANDARDS[standard] : standard;
  if (!S) throw new Error('Unknown standard: ' + standard + ' (use one of ' + Object.keys(STANDARDS).join(', ') + ')');
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

module.exports = { parse, check, stamp, STANDARDS, SOURCES };
