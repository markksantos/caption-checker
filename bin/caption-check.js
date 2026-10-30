#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { parse, check, fix, STANDARDS } = require('..');

const HELP = `caption-check: check SRT / WebVTT captions against Netflix, BBC or DCMP limits

Usage: caption-check <file.srt|file.vtt> [more files] [options]

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

Exit code: 0 when every caption meets the standard's limits (after fixing, with --fix), 1 when any caption breaks one, 2 on a usage error.
Online version: https://www.markstudios.com/tools/caption-checker`;

const args = process.argv.slice(2);
if (args.includes('--mcp')) {
  require('../mcp.js').serve();
  return;
}
const opts = { standard: 'netflix', fps: 24, vertical: false, json: false, advice: false, fix: null };
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
  else if (a.startsWith('-')) { console.error('Unknown option ' + a + '\n\n' + HELP); process.exit(2); }
  else files.push(a);
}
if (!files.length) { console.error(HELP); process.exit(2); }
if (!STANDARDS[opts.standard]) { console.error('Unknown standard "' + opts.standard + '". Use one of: ' + Object.keys(STANDARDS).join(', ')); process.exit(2); }
if (!(opts.fps > 0)) { console.error('--fps needs a positive number'); process.exit(2); }
if (opts.fix !== null && (!opts.fix || files.length !== 1)) { console.error('--fix needs an output path and exactly one input file'); process.exit(2); }

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
