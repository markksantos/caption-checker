'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { convert, retime, parseTime } = require('../convert.js');

const SRT = fs.readFileSync(path.join(__dirname, '..', 'examples', 'travel-vlog.srt'), 'utf8');
const times = (text) => [...text.matchAll(/(\d\d:\d\d:\d\d[,.]\d\d\d) --> (\d\d:\d\d:\d\d[,.]\d\d\d)/g)].map((m) => [m[1], m[2]]);

test('SRT to WebVTT and back gives the same file', () => {
  const vtt = convert(SRT);
  assert.equal(vtt.from, 'srt');
  assert.equal(vtt.to, 'vtt');
  assert.match(vtt.text, /^WEBVTT\n\n1\n00:00:00\.500 --> 00:00:03\.000\nWelcome back to the channel\.\n/);
  assert.deepEqual(vtt.notes, []);
  assert.equal(convert(vtt.text, 'srt').text, SRT);
});

test('formatting the other format can hold is translated, the rest is listed', () => {
  const srt = '1\n00:00:01,000 --> 00:00:02,000\n{\\an8}<i>Top</i> & <font color="red">red</font>\n\n2\n00:00:03,000 --> 00:00:04,000\nA < B\n';
  const out = convert(srt, 'vtt');
  assert.equal(out.text, 'WEBVTT\n\n1\n00:00:01.000 --> 00:00:02.000 line:0\n<i>Top</i> &amp; red\n\n2\n00:00:03.000 --> 00:00:04.000\nA &lt; B\n');
  assert.deepEqual(out.notes, ['1 position code ({\\an8} and the like) became WebVTT line and align settings.',
    '1 font colour tag removed: WebVTT has no font tag (colours go in ::cue CSS instead).']);
  const vtt = 'WEBVTT\n\nNOTE made by hand\n\nintro\n00:01.000 --> 00:02.500 align:left\n<v Ana>Hello &amp; welcome</v>\n';
  const back = convert(vtt, 'srt', { speakers: true });
  assert.equal(back.text, '1\n00:00:01,000 --> 00:00:02,500\n{\\an1}Ana: Hello & welcome\n');
  assert.equal(back.notes.length, 4);  // position, voice, cue name, NOTE block
});

test('WebVTT output is put in start-time order; CRLF on request', () => {
  const srt = '1\n00:00:05,000 --> 00:00:06,000\nB\n\n2\n00:00:01,000 --> 00:00:02,000\nA\n';
  const out = convert(srt, 'vtt', { eol: 'crlf' });
  assert.equal(out.text, 'WEBVTT\r\n\r\n2\r\n00:00:01.000 --> 00:00:02.000\r\nA\r\n\r\n1\r\n00:00:05.000 --> 00:00:06.000\r\nB\r\n');
  assert.ok(out.notes.includes('Captions put in start-time order, as WebVTT requires.'));
});

test('offset, from caption N, and back again restores the file', () => {
  const later = retime(SRT, { offset: '0:01.250', from: 3 });
  assert.equal(later.changed, 6);
  assert.deepEqual(times(later.text).slice(0, 3), [['00:00:00,500', '00:00:03,000'], ['00:00:03,000', '00:00:06,500'], ['00:00:07,850', '00:00:08,350']]);
  assert.equal(retime(later.text, { offset: -1.25, from: 3 }).text, SRT);
});

test('start_at moves the whole file so one caption lands on a time', () => {
  const r = retime(SRT, { startAt: { caption: 2, time: '10' } });
  assert.equal(r.offsetMs, 7000);
  assert.deepEqual(times(r.text)[1], ['00:00:10,000', '00:00:13,500']);
});

test('frame-rate change scales every time; a two-point sync finds the same rate', () => {
  const r = retime(SRT, { rate: { from: 25, to: 23.976 } });
  assert.equal(r.changed, 8);
  const t = times(r.text);
  assert.deepEqual(t[1], ['00:00:03,128', '00:00:06,778']);  // 3000 x 25/23.976 = 3128.1, 6500 x 25/23.976 = 6777.6
  const src = times(SRT), ms = (x) => parseTime(x);
  const s = retime(SRT, { sync: [{ caption: 1, time: t[0][0] }, { caption: 8, time: t[7][0] }] });
  assert.match(s.summary, /captions timed for 25 fps on a 23\.976 fps video/);
  assert.ok(Math.abs(s.scale - 25 / 23.976) < 0.0002, String(s.scale));
  assert.ok(ms(src[7][0]) > 0);
});

test('times before 0:00 are clamped and counted; bad input throws', () => {
  const r = retime(SRT, { offset: '-5s' });
  assert.equal(r.clamped, 2);
  assert.match(r.notes[0], /^2 captions would have started before 0:00/);
  assert.throws(() => retime(SRT, {}), /exactly one of offset, startAt, rate or sync/);
  assert.throws(() => retime(SRT, { offset: 1, rate: { from: 25, to: 24 } }), /exactly one/);
  assert.throws(() => retime(SRT, { startAt: { caption: 99, time: '1' } }), /no caption 99/);
  assert.throws(() => retime(SRT, { rate: { from: 25, to: 25 } }), /the same/);
  assert.throws(() => retime(SRT, { sync: [{ caption: 4, time: '9' }, { caption: 1, time: '10' }] }), /has to start after/);
  assert.throws(() => convert('just some words'), /No captions found/);
  assert.throws(() => convert(SRT, 'ass'), /srt or vtt/);
});

test('parseTime reads the forms people type', () => {
  for (const [s, ms] of [['1.5', 1500], ['1,25', 1250], ['-0.5', -500], ['1:02.5', 62500], ['00:01:02,345', 62345], ['2m30s', 150000],
    ['1h2m3.5s', 3723500], ['750ms', 750], ['+3', 3000], [2.25, 2250]]) assert.equal(parseTime(s), ms, String(s));
  assert.ok(Number.isNaN(parseTime('soon')));
});

test('caption files in Windows-1252 and UTF-16 are read correctly', () => {
  const { decode } = require('../convert.js');
  const srt = '1\n00:00:01,000 --> 00:00:02,000\nCafé, señor — ¿sí?\n';
  assert.deepEqual(decode(Buffer.from(srt, 'utf8')), { text: srt, encoding: 'UTF-8' });
  const cp = Buffer.from([...Buffer.from('1\n00:00:01,000 --> 00:00:02,000\nCaf', 'latin1'), 0xE9, ...Buffer.from(', se', 'latin1'), 0xF1,
    ...Buffer.from('or ', 'latin1'), 0x97, ...Buffer.from(' ', 'latin1'), 0xBF, ...Buffer.from('s', 'latin1'), 0xED, ...Buffer.from('?\n', 'latin1')]);
  assert.deepEqual(decode(cp), { text: srt, encoding: 'Windows-1252' });
  const u16 = Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from(srt, 'utf16le')]);
  assert.deepEqual(decode(u16), { text: srt, encoding: 'UTF-16' });
  assert.match(convert(decode(cp).text, 'vtt').text, /Café, señor — ¿sí\?/);
});
