'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { parse, check, stamp } = require('..');

const example = fs.readFileSync(path.join(__dirname, '..', 'examples', 'travel-vlog.srt'), 'utf8');

test('timestamps', () => {
  assert.strictEqual(stamp('00:01:02,345'), 62.345);
  assert.strictEqual(stamp('01:02.5'), 62.5);
  assert.ok(Number.isNaN(stamp('nope')));
});

test('netflix flags the expected captions', () => {
  const res = check(parse(example), 'netflix', { fps: 24 });
  assert.strictEqual(res.cues.length, 8);
  assert.strictEqual(res.flagged, 6);
  const kinds = (n) => res.cues[n - 1].issues.filter((x) => x.severity === 'limit').map((x) => x.kind).sort();
  assert.deepStrictEqual(kinds(1), ['gap']);            // 0-frame gap
  assert.deepStrictEqual(kinds(3), ['short']);          // 0.5 s < 5/6 s
  assert.deepStrictEqual(kinds(4), ['cpl', 'speed']);   // 74 characters, ~41 cps
  assert.deepStrictEqual(kinds(5), ['long', 'overlap']);
  assert.deepStrictEqual(kinds(6), ['lines']);
  assert.deepStrictEqual(kinds(7), ['cpl']);            // 50 characters
  assert.deepStrictEqual(kinds(8), []);
});

test('children\'s limit is stricter', () => {
  const res = check(parse(example), 'netflix-kids');
  assert.ok(res.cues[1].issues.some((x) => x.kind === 'speed'));
});

test('bbc and dcmp use words a minute', () => {
  const bbc = check(parse(example), 'bbc');
  assert.ok(bbc.cues[6].issues.some((x) => x.kind === 'speed' && /200 words a minute/.test(x.message)));
  assert.ok(bbc.cues[5].issues.some((x) => x.kind === 'lines' && x.severity === 'limit'));
  const vertical = check(parse(example), 'bbc', { vertical: true });
  assert.ok(!vertical.cues[5].issues.some((x) => x.kind === 'lines'));
  const dcmp = check(parse(example), 'dcmp-lower');
  assert.ok(dcmp.cues[4].issues.some((x) => x.kind === 'long'));
  assert.ok(dcmp.cues[5].issues.some((x) => x.kind === 'lines' && x.severity === 'advice'));
});

test('webvtt with tags, settings and NOTE blocks', () => {
  const vtt = 'WEBVTT\n\nNOTE written by hand\n\nintro\n00:01.000 --> 00:03.000 align:start\n<v Mark>Hello <i>there</i>, friends.\n\n00:03.040 --> 00:04.000\nShort &amp; sweet\n';
  const p = parse(vtt);
  assert.strictEqual(p.vtt, true);
  assert.strictEqual(p.cues.length, 2);
  assert.strictEqual(p.cues[0].id, 'intro');
  assert.deepStrictEqual(p.cues[0].lines, ['Hello there, friends.']);
  assert.deepStrictEqual(p.cues[1].lines, ['Short & sweet']);
  const res = check(p, 'netflix', { fps: 25 });
  assert.ok(res.cues[0].issues.some((x) => /1 frame at 25 fps/.test(x.message)));
});

test('blocks without timing are skipped, not counted', () => {
  const p = parse('hello world\n\n1\n00:00:01,000 --> 00:00:02,000\nHi');
  assert.strictEqual(p.cues.length, 1);
  assert.strictEqual(p.skipped.length, 1);
});

test('cli prints complete JSON for large files when piped', () => {
  const { spawnSync } = require('child_process');
  const os = require('os');
  const tc = (s) => new Date(s * 1000).toISOString().slice(11, 23).replace('.', ',');
  let srt = '';
  for (let i = 0; i < 1500; i++) srt += `${i + 1}\n${tc(i * 2)} --> ${tc(i * 2 + 1.5)}\nCaption number ${i + 1} reads at a steady pace.\n\n`;
  const file = path.join(os.tmpdir(), `caption-checker-large-${process.pid}.srt`);
  fs.writeFileSync(file, srt);
  const run = spawnSync(process.execPath, [path.join(__dirname, '..', 'bin', 'caption-check.js'), file, '--json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  fs.unlinkSync(file);
  const out = JSON.parse(run.stdout);
  assert.strictEqual(out.cues.length, 1500);
});

test('minutes and seconds over 59 are not valid times', () => {
  // boundaries that are valid
  assert.strictEqual(stamp('00:00:59,999'), 59.999);
  assert.strictEqual(stamp('00:59:59,999'), 3599.999);
  assert.strictEqual(stamp('59:59.999'), 3599.999);         // WebVTT without hours
  assert.strictEqual(stamp('99:00:00,000'), 356400);        // hours have no upper limit
  // one past them
  for (const t of ['00:00:60,000', '00:60:00,000', '60:00.000', '00:01:75,000', '00:99:99,999']) assert.ok(Number.isNaN(stamp(t)), t);
  // malformed
  for (const t of ['00:00:01:000', '00:00:01,0000', '00:00:01', '0:0:,5', '-00:00:01,000', '00:00:01.5x']) assert.ok(Number.isNaN(stamp(t)), t);
});

test('a caption with an out-of-range time fails the check', () => {
  // 00:00:58 -> 00:00:60 would be a passing 2 s caption if 60 seconds were read as 1:00
  const srt = '1\n00:00:58,000 --> 00:00:60,000\nHello there.\n\n2\n00:01:00,500 --> 00:01:02,000\nAnd again.\n';
  const res = check(parse(srt), 'netflix');
  assert.strictEqual(res.flagged, 1);
  assert.deepStrictEqual(res.cues[0].issues.map((x) => [x.kind, x.severity, x.message]),
    [['timing', 'limit', 'The time "00:00:60,000" has minutes or seconds over 59']]);
  assert.deepStrictEqual(res.cues[1].issues.filter((x) => x.severity === 'limit'), []);
  const vtt = check(parse('WEBVTT\n\n60:00.000 --> 60:02.000\nHello there.\n'), 'netflix');
  assert.strictEqual(vtt.cues[0].issues[0].message, 'The time "60:00.000" has minutes or seconds over 59');
  const bad = check(parse('1\n00:00:01,000 --> 00:00:02;000\nHello there.\n'), 'netflix');
  assert.match(bad.cues[0].issues[0].message, /^The timing line can't be read/);
});

test('the cli exits 1 on an out-of-range time', () => {
  const { spawnSync } = require('child_process');
  const os = require('os');
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cc-')), 'sixty.srt');
  fs.writeFileSync(f, '1\n00:00:58,000 --> 00:00:60,000\nHello there.\n');
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'bin', 'caption-check.js'), f], { encoding: 'utf8' });
  assert.strictEqual(r.status, 1);
  assert.match(r.stdout, /0 of 1 captions meet/);
  assert.match(r.stdout, /minutes or seconds over 59/);
});
