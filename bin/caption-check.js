#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { parse, check, fix, STANDARDS } = require('..');
const { convert, retime } = require('../convert.js');

const HELP = `caption-check: check SRT / WebVTT captions against Netflix, BBC or DCMP limits, fix them, convert or retime them

Usage: caption-check <file.srt|file.vtt> [more files] [options]
       caption-check <file> --to vtt|srt [--out <file>]                    convert SubRip <-> WebVTT
       caption-check <file> --shift <time> | --start-at <n=time> | --rate <from:to> | --sync <n=time,n=time> [--out <file>]

Options:
  -s, --standard <id>   ${Object.keys(STANDARDS).join(' | ')}  (default: netflix)
  -f, --fps <rate>      frame rate for frame-gap checks (default: 24)
      --vertical        9:16 video (the BBC allows three lines)
      --json            print JSON instead of text
      --advice          also print advice-only notes in text output
      --fix <out>       write a fixed copy to <out>: rewraps long lines and moves out-times into free
                        time or off overlaps, never changing a word or an in-time (one input file)
      --mcp             run as an MCP server on stdio (Claude, Cursor, VS Code, ...)
  -h, --help

Convert and retime (one input file; writes to --out, or prints the file to stdout and the summary to stderr):
      --to <srt|vtt>    write SubRip or WebVTT (default for --to alone: the other format; when retiming: the same)
      --shift <time>    move every caption by <time>: 1.5, -0:02.250, 2m30s, 750ms (minus = earlier)
      --start-at <n=t>  move the file so caption n starts at time t (5=0:12.000)
      --rate <from:to>  captions timed for one frame rate on a video at another (23.976:25); every time x from/to
      --sync <n=t,n=t>  pin two captions to their right start times and stretch everything else (1=0:05,412=41:12.5)
      --from <n>        with --shift or --start-at, leave the captions before caption n alone
      --speakers        WebVTT to SubRip: write <v Name> voice tags as "Name: "
      --crlf            write Windows (CRLF) line endings (default: the source's)
      --out <file>      where to write the converted or retimed file

Exit code: 0 when every caption meets the standard's limits (after fixing, with --fix), 1 when any caption breaks one, 2 on a usage error.
Online version: https://www.markstudios.com/tools/caption-checker`;

const args = process.argv.slice(2);
if (args.includes('--mcp')) {
  require('../mcp.js').serve();
  return;
}
const opts = { standard: 'netflix', fps: 24, vertical: false, json: false, advice: false, fix: null };
const conv = {};
const files = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '-h' || a === '--help') { console.log(HELP); process.exit(0); }
  else if (a === '-s' || a === '--standard') opts.standard = args[++i];
  else if (a === '-f' || a === '--fps') opts.fps = parseFloat(args[++i]);
  else if (a === '--vertical') opts.vertical = true;
  else if (a === '--json') opts.json = true;
  else if (a === '--advice') opts.advice = true;
  else if (a === '--fix') opts.fix = args[++i];
  else if (['--to', '--shift', '--start-at', '--rate', '--sync', '--from', '--out'].includes(a)) conv[a.slice(2)] = args[++i];
  else if (a === '--speakers' || a === '--crlf') conv[a.slice(2)] = true;
  else if (a.startsWith('-')) { console.error('Unknown option ' + a + '\n\n' + HELP); process.exit(2); }
  else files.push(a);
}
if (!files.length) { console.error(HELP); process.exit(2); }
if (!STANDARDS[opts.standard]) { console.error('Unknown standard "' + opts.standard + '". Use one of: ' + Object.keys(STANDARDS).join(', ')); process.exit(2); }
if (!(opts.fps > 0)) { console.error('--fps needs a positive number'); process.exit(2); }
if (opts.fix !== null && (!opts.fix || files.length !== 1)) { console.error('--fix needs an output path and exactly one input file'); process.exit(2); }

// --to, --shift, --start-at, --rate, --sync: convert or retime one file
if (Object.keys(conv).length) {
  const point = (v, flag) => {
    const m = /^(\d+)=(.+)$/.exec(String(v || '').trim());
    if (!m) { console.error(flag + ' needs caption=time, like 5=0:12.000'); process.exit(2); }
    return { caption: +m[1], time: m[2] };
  };
  const how = { to: conv.to, speakers: conv.speakers === true, eol: conv.crlf ? 'crlf' : undefined, name: files[0] };
  if (conv.shift !== undefined) how.offset = conv.shift;
  if (conv['start-at'] !== undefined) how.startAt = point(conv['start-at'], '--start-at');
  if (conv.rate !== undefined) {
    const m = /^([\d.]+):([\d.]+)$/.exec(String(conv.rate));
    if (!m) { console.error('--rate needs from:to frame rates, like 23.976:25'); process.exit(2); }
    how.rate = { from: +m[1], to: +m[2] };
  }
  if (conv.sync !== undefined) how.sync = String(conv.sync).split(',').map((x) => point(x, '--sync'));
  if (conv.from !== undefined) how.from = parseInt(conv.from, 10);
  const retiming = ['offset', 'startAt', 'rate', 'sync'].some((k) => how[k] !== undefined);
  if (files.length !== 1) { console.error('Convert and retime take exactly one input file'); process.exit(2); }
  if (!retiming && conv.to === undefined) { console.error('--from, --speakers, --crlf and --out go with --to, --shift, --start-at, --rate or --sync'); process.exit(2); }
  if (conv.out === '') { console.error('--out needs a path'); process.exit(2); }
  let text, res;
  try { text = fs.readFileSync(files[0], 'utf8'); } catch (e) { console.error(files[0] + ': ' + e.message); process.exit(2); }
  try { res = retiming ? retime(text, how) : convert(text, how.to, how); } catch (e) { console.error(path.basename(files[0]) + ': ' + e.message); process.exit(2); }
  const label = { srt: 'SubRip (.srt)', vtt: 'WebVTT (.vtt)' };
  const report = [retiming ? `${path.basename(files[0])}: ${res.summary}` : `${path.basename(files[0])}: ${res.captions} captions converted from ${label[res.from]} to ${label[res.to]}.`]
    .concat(retiming && res.to !== res.from ? [`Written as ${label[res.to]}.`] : [], res.notes);
  if (opts.json) report.splice(0, report.length, JSON.stringify({ file: files[0], out: conv.out || null, ...res, text: undefined }, null, 2));
  if (conv.out) {
    try { fs.writeFileSync(conv.out, res.text); } catch (e) { console.error(conv.out + ': ' + e.message); process.exit(2); }
    console.log(report.join('\n') + (opts.json ? '' : `\nWritten to ${conv.out}`));
  } else {
    process.stdout.write(res.text);
    console.error(report.join('\n'));
  }
  return;
}

const tc = (sec) => {
  if (!Number.isFinite(sec)) return '--:--';
  const ms = Math.round(sec * 1000), h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000);
  return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(s).padStart(2, '0') + '.' + String(ms % 1000).padStart(3, '0');
};

if (opts.fix) {
  let text;
  try { text = fs.readFileSync(files[0], 'utf8'); } catch (e) { console.error(files[0] + ': ' + e.message); process.exit(2); }
  const res = fix(text, opts.standard, opts);
  try { fs.writeFileSync(opts.fix, res.text); } catch (e) { console.error(opts.fix + ': ' + e.message); process.exit(2); }
  const total = res.after.cues.length;
  if (opts.json) {
    console.log(JSON.stringify({ file: files[0], out: opts.fix, standard: res.after.standard.id, captions: total,
      flaggedBefore: res.before.flagged, flaggedAfter: res.after.flagged, changes: res.changes, unresolved: res.unresolved }, null, 2));
  } else {
    const fixedCues = new Set(res.changes.map((x) => x.n)).size;
    console.log(`${path.basename(files[0])}: ${res.changes.length} ${res.changes.length === 1 ? 'change' : 'changes'} in ${fixedCues} ${fixedCues === 1 ? 'caption' : 'captions'}, written to ${opts.fix}`);
    for (const x of res.changes) console.log(`  #${x.n}  ${x.what}`);
    if (res.unresolved.length) {
      console.log(`  Left for a person (${res.unresolved.length}):`);
      for (const x of res.unresolved) console.log(`  #${x.n}  ${x.why}`);
    }
    console.log(`${path.basename(opts.fix)}: ${total - res.after.flagged} of ${total} captions meet ${res.after.standard.name} (before: ${total - res.before.flagged} of ${total})`);
  }
  process.exitCode = res.after.flagged || !total ? 1 : 0;
  return;
}

let failed = false;
const out = [];
for (const file of files) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) { console.error(file + ': ' + e.message); process.exit(2); }
  const parsed = parse(text);
  const res = check(parsed, opts.standard, opts);
  if (res.flagged || !parsed.cues.length) failed = true;
  if (opts.json) { out.push({ file, skippedBlocks: parsed.skipped.length, ...res, standard: res.standard.id }); continue; }
  const name = path.basename(file);
  if (!parsed.cues.length) { console.log(`${name}: no captions found (each needs a timing line like 00:00:01,000 --> 00:00:03,500)`); continue; }
  console.log(`${name}: ${res.cues.length - res.flagged} of ${res.cues.length} captions meet ${res.standard.name}`);
  for (const c of res.cues) {
    const shown = c.issues.filter((x) => x.severity === 'limit' || opts.advice);
    if (!shown.length) continue;
    console.log(`  #${c.n}  ${tc(c.start)} -> ${tc(c.end)}  ${c.lines.join(' / ').slice(0, 70)}`);
    for (const x of shown) console.log(`      ${x.severity === 'limit' ? '✗' : '·'} ${x.message}`);
  }
  console.log(`  average ${res.stats.averageCps.toFixed(1)} cps · fastest ${res.stats.maxCps.toFixed(1)} cps · longest line ${res.stats.longestLine} characters`);
}
if (opts.json) console.log(JSON.stringify(files.length === 1 ? out[0] : out, null, 2));
// exitCode, not process.exit(): exit() can cut off piped stdout (JSON for long files) before it drains
process.exitCode = failed ? 1 : 0;
