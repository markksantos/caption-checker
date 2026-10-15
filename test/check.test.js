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
