'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { parse, fix, wrap } = require('..');

const example = fs.readFileSync(path.join(__dirname, '..', 'examples', 'travel-vlog.srt'), 'utf8');
const words = (p) => p.cues.map((c) => c.lines.join(' ')).join(' ').split(/\s+/).join(' ');

test('netflix: fixes 4 of the 6 flagged captions and names the other 2', () => {
  const r = fix(example, 'netflix', { fps: 24 });
  assert.strictEqual(r.before.flagged, 6);
  assert.strictEqual(r.after.flagged, 2);
  assert.deepStrictEqual(r.unresolved.map((x) => x.n), [3, 4]);
  const after = parse(r.text).cues;
  assert.strictEqual(after[0].end, 2.916);                 // 2 frames at 24 fps before #2
  assert.strictEqual(after[1].end, 6.516);                 // a 0.1 s gap closed to 2 frames
  assert.strictEqual(after[4].end, 16.1);                  // off the overlap, then to the 7 s maximum
  assert.deepStrictEqual(after[3].lines, ['we packed water, snacks, a rain jacket', 'and a spare battery for the camera.']);
  assert.deepStrictEqual(after[5].lines, ['Three miles up, two hours in,', 'no shade at all.']);
  assert.deepStrictEqual(after[6].lines, ['The view from the top', 'was worth every single step.']);
});

test('never changes a word, an in-time or the number of captions', () => {
  const before = parse(example);
  for (const id of ['netflix', 'netflix-kids', 'bbc', 'dcmp-lower']) {
    const after = parse(fix(example, id).text);
    assert.strictEqual(after.cues.length, before.cues.length);
    assert.strictEqual(words(after), words(before));
    assert.deepStrictEqual(after.cues.map((c) => c.start), before.cues.map((c) => c.start));
  }
});

test('a second run changes nothing', () => {
  for (const id of ['netflix', 'bbc', 'dcmp-middle']) {
    const once = fix(example, id).text;
    const twice = fix(once, id);
    assert.deepStrictEqual(twice.changes, []);
    assert.strictEqual(twice.text, once);
  }
});

test('untouched captions keep their exact bytes', () => {
  const out = fix(example, 'netflix').text.split('\n\n');
  const src = example.split('\n\n');
  assert.strictEqual(out[7], src[7]);   // #8 needed nothing
  assert.strictEqual(out.length, src.length);
});

test('bbc: 37 characters, three lines allowed on vertical video, no gap rule', () => {
  const r = fix(example, 'bbc');
  const bbc = parse(r.text).cues;
  assert.ok(bbc.every((c) => c.n === 4 || c.lines.every((l) => l.length <= 37)));
  assert.ok(r.unresolved.some((x) => x.n === 4 && /Too long for 2 lines of 37 characters/.test(x.why))); // 74 characters
  assert.strictEqual(bbc[5].lines.length, 2);
  assert.strictEqual(bbc[4].end, 16.8);                    // overlap closed to the next in-time
  const vertical = parse(fix(example, 'bbc', { vertical: true }).text).cues;
  assert.strictEqual(vertical[5].lines.length, 3);         // left as it was
});

test('dcmp: cuts to the 6 s maximum and keeps line breaks it only prefers', () => {
  const r = fix(example, 'dcmp-upper');
  const cues = parse(r.text).cues;
  assert.strictEqual(cues[4].end, 15.1);
  assert.strictEqual(cues[5].lines.length, 3);             // DCMP's two lines is a preference, not a limit
});

test('webvtt: header, NOTE, cue settings, entities, CRLF and BOM survive', () => {
  const vtt = '﻿WEBVTT\r\n\r\nNOTE kept as is\r\n\r\nintro\r\n00:00.500 --> 00:04.000 align:start line:0\r\n' +
    'Salt &amp; pepper go into the pot first, then the onions and garlic\r\n\r\n00:03.900 --> 00:06.000\r\n<i>Tagged lines that run far past forty-two characters stay</i>\r\n';
  const r = fix(vtt, 'netflix', { fps: 25 });
  assert.ok(r.text.startsWith('﻿WEBVTT\r\n\r\nNOTE kept as is\r\n\r\nintro\r\n00:00.500 --> 00:03.820 align:start line:0\r\n'));
  assert.ok(r.text.includes('Salt &amp; pepper go into the pot first,\r\nthen the onions and garlic\r\n'));
  assert.ok(!/[^\r]\n/.test(r.text));
  assert.deepStrictEqual(r.unresolved.map((x) => x.n), [2]);
  assert.match(r.unresolved[0].why, /formatting tags/);
});

test('hours stay in the format they were written in', () => {
  const r = fix('1\n01:00:00,000 --> 01:00:00,300\nHi.\n', 'netflix');
  assert.ok(r.text.includes('01:00:00,000 --> 01:00:00,834'));
  const v = fix('WEBVTT\n\n59:59.900 --> 1:00:00.000\nHi.\n', 'netflix');
  assert.ok(v.text.includes('59:59.900 --> 1:00:00.734'));
});

test('wrap breaks between words only, and gives up on a word longer than a line', () => {
  assert.deepStrictEqual(wrap('He said he was going to the store, but he never came back home that night'.split(' '), 2, 42),
    ['He said he was going to the store,', 'but he never came back home that night']);
  assert.strictEqual(wrap(['x'.repeat(50)], 2, 42), null);
  assert.deepStrictEqual(wrap(['short', 'line'], 2, 42), ['short line']);
});

test('cli --fix writes the file and exits 1 while captions still fail', () => {
  const { spawnSync } = require('child_process');
  const os = require('os');
  const out = path.join(os.tmpdir(), `caption-checker-fixed-${process.pid}.srt`);
  const bin = path.join(__dirname, '..', 'bin', 'caption-check.js');
  const run = spawnSync(process.execPath, [bin, path.join(__dirname, '..', 'examples', 'travel-vlog.srt'), '--fix', out], { encoding: 'utf8' });
  assert.strictEqual(run.status, 1);
  assert.match(run.stdout, /6 of 8 captions meet Netflix English, adult programs \(before: 2 of 8\)/);
  assert.strictEqual(fs.readFileSync(out, 'utf8'), fix(example, 'netflix').text);
  fs.unlinkSync(out);
  const usage = spawnSync(process.execPath, [bin, 'a.srt', 'b.srt', '--fix', out], { encoding: 'utf8' });
  assert.strictEqual(usage.status, 2);
});
