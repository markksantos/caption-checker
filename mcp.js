'use strict';

// A minimal Model Context Protocol server (stdio transport, newline-delimited
// JSON-RPC 2.0) exposing the checker as three tools. No dependencies.

const fs = require('fs');
const { parse, check, fix, STANDARDS, SOURCES } = require('./index.js');
const { version } = require('./package.json');

const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const STANDARD_IDS = Object.keys(STANDARDS);
const MAX_ISSUES_IN_TEXT = 60;

const TOOLS = [
  {
    name: 'check_captions',
    title: 'Check captions against a standard',
    description:
      'Check an SRT or WebVTT caption file against Netflix English, the BBC subtitle guidelines or the DCMP Captioning Key: ' +
      'reading speed, characters a line, lines a caption, shortest and longest time on screen, gaps between captions, ' +
      'overlaps and unreadable timing lines. Pass a file path or the caption text itself. Read-only.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to a .srt or .vtt file on this machine.' },
        text: { type: 'string', description: 'The caption file contents, when there is no file path.' },
        standard: { type: 'string', enum: STANDARD_IDS, description: 'Which standard to check against (default netflix).' },
        fps: { type: 'number', exclusiveMinimum: 0, description: 'Frame rate for frame-based gap checks (default 24).' },
        vertical: { type: 'boolean', description: '9:16 video; the BBC allows three lines.' },
        include_advice: { type: 'boolean', description: 'Also list notes a standard words as a recommendation, not a limit.' },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'fix_captions',
    title: 'Fix captions to a standard',
    description:
      'Fix an SRT or WebVTT caption file to Netflix English, BBC or DCMP limits without changing a word or an in-time: ' +
      'rewraps lines that are too long or too many, pulls out-times off overlaps and gaps under the minimum, cuts captions ' +
      'to the longest time on screen, and extends out-times into free time when a caption is too short or reads too fast. ' +
      'Returns the fixed file as text (second content item) with a list of changes and of captions left for a person. ' +
      'Writes nothing to disk: save the fixed text yourself.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to a .srt or .vtt file on this machine.' },
        text: { type: 'string', description: 'The caption file contents, when there is no file path.' },
        standard: { type: 'string', enum: STANDARD_IDS, description: 'Which standard to fix to (default netflix).' },
        fps: { type: 'number', exclusiveMinimum: 0, description: 'Frame rate for frame-based gaps (default 24).' },
        vertical: { type: 'boolean', description: '9:16 video; the BBC allows three lines.' },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'list_standards',
    title: 'List caption standards',
    description: 'List the standards check_captions knows, with each limit it applies and the page the limit was read from.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
];

class ToolError extends Error {}

const tc = (sec) => {
  if (!Number.isFinite(sec)) return '--:--';
  const ms = Math.round(sec * 1000), h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000);
  return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(s).padStart(2, '0') + '.' + String(ms % 1000).padStart(3, '0');
};

function describeStandard(S) {
  const limits = [];
  if (S.cps) limits.push(`reading speed up to ${S.cps} characters a second`);
  if (S.wpm) limits.push(`reading speed up to ${S.wpm} words a minute (${S.speedNote})`);
  if (S.cpl) limits.push(`${S.cpl} characters a line`);
  if (S.lines) limits.push(`${S.lines} lines a caption${S.linesVertical ? ` (${S.linesVertical} for vertical video)` : ''}${S.linesSeverity === 'advice' ? ' (preferred)' : ''}`);
  if (S.minDur) limits.push(`at least ${S.minDurLabel} on screen`);
  if (S.maxDur) limits.push(`at most ${S.maxDur} s on screen`);
  if (S.gapFrames) limits.push(`gaps of at least ${S.gapFrames} frames`);
  if (S.gapMinSeconds) limits.push(`gaps, if any, of at least ${S.gapMinSeconds} s (advice)`);
  if (S.secPerWord) limits.push(`about ${S.secPerWord} s a word on screen (advice)`);
  return limits;
}

function sourcesFor(id) {
  if (id.startsWith('netflix')) return [SOURCES.netflix, SOURCES.netflixGeneral, SOURCES.netflixTiming];
  if (id === 'bbc') return [SOURCES.bbc];
  return [SOURCES.dcmpText, SOURCES.dcmpRate];
}

function summarize(res, parsed, includeAdvice) {
  const S = res.standard;
  if (!parsed.cues.length) return 'No captions found. Each caption needs a timing line like 00:00:01,000 --> 00:00:03,500.';
  const lines = [`${res.cues.length - res.flagged} of ${res.cues.length} captions meet ${S.name}.`];
  let shown = 0, hidden = 0;
  for (const c of res.cues) {
    const issues = c.issues.filter((x) => x.severity === 'limit' || includeAdvice);
    if (!issues.length) continue;
    if (shown >= MAX_ISSUES_IN_TEXT) { hidden++; continue; }
    shown++;
    lines.push(`#${c.n}  ${tc(c.start)} -> ${tc(c.end)}  ${c.lines.join(' / ').slice(0, 70)}`);
    for (const x of issues) lines.push(`    ${x.severity === 'limit' ? 'LIMIT' : 'advice'}: ${x.message}`);
  }
  if (hidden) lines.push(`...and ${hidden} more captions with issues (all of them are in the structured result).`);
  lines.push(`Average ${res.stats.averageCps.toFixed(1)} characters a second, fastest ${res.stats.maxCps.toFixed(1)}, longest line ${res.stats.longestLine} characters.`);
  if (parsed.skipped.length) lines.push(`${parsed.skipped.length} block(s) without a timing line were skipped.`);
  return lines.join('\n');
}

function createServer({ readFile = (p) => fs.readFileSync(p, 'utf8') } = {}) {
  // The arguments check_captions and fix_captions share: one of path or text, a standard and a frame rate.
  function input(args) {
    const hasPath = typeof args.path === 'string' && args.path !== '';
    const hasText = typeof args.text === 'string';
    if (hasPath === hasText) throw new ToolError('Pass exactly one of path or text.');
    const standard = args.standard === undefined ? 'netflix' : args.standard;
    if (!STANDARDS[standard]) throw new ToolError(`standard must be one of: ${STANDARD_IDS.join(', ')}`);
    const fps = args.fps === undefined ? 24 : args.fps;
    if (typeof fps !== 'number' || !(fps > 0)) throw new ToolError('fps must be a positive number');
    let src = args.text;
    if (hasPath) {
      try { src = readFile(args.path); } catch (err) { throw new ToolError(`Can't read ${args.path}: ${err.message}`); }
    }
    return { src, standard, fps };
  }

  const tools = {
    async check_captions(args) {
      const { src, standard, fps } = input(args);
      const parsed = parse(src);
      const res = check(parsed, standard, { fps, vertical: args.vertical === true });
      return {
        text: summarize(res, parsed, args.include_advice === true),
        structured: {
          standard: standard,
          standardName: res.standard.name,
          captions: res.cues.length,
          flagged: res.flagged,
          advisoryOnly: res.advisoryOnly,
          counts: res.counts,
          stats: res.stats,
          skippedBlocks: parsed.skipped.length,
          issues: res.cues.filter((c) => c.issues.length).map((c) => ({
            n: c.n, start: c.start, end: c.end, text: c.lines.join('\n'), issues: c.issues,
          })),
        },
      };
    },
    async fix_captions(args) {
      const { src, standard, fps } = input(args);
      const res = fix(src, standard, { fps, vertical: args.vertical === true });
      const total = res.after.cues.length;
      if (!total) throw new ToolError('No captions found. Each caption needs a timing line like 00:00:01,000 --> 00:00:03,500.');
      const lines = [`${res.changes.length} ${res.changes.length === 1 ? 'change' : 'changes'}. ${total - res.after.flagged} of ${total} captions now meet ${res.after.standard.name} (before: ${total - res.before.flagged}).`];
      for (const x of res.changes.slice(0, MAX_ISSUES_IN_TEXT)) lines.push(`#${x.n}  ${x.what}`);
      if (res.changes.length > MAX_ISSUES_IN_TEXT) lines.push(`...and ${res.changes.length - MAX_ISSUES_IN_TEXT} more changes (all of them are in the structured result).`);
      if (res.unresolved.length) lines.push(`Left for a person (${res.unresolved.length}):`, ...res.unresolved.map((x) => `#${x.n}  ${x.why}`));
      lines.push('The fixed file is the next content item.');
      return {
        text: lines.join('\n'),
        extra: res.text,
        structured: {
          standard, standardName: res.after.standard.name, captions: total,
          flaggedBefore: res.before.flagged, flaggedAfter: res.after.flagged,
          changes: res.changes, unresolved: res.unresolved, fixed: res.text,
        },
      };
    },
    async list_standards() {
      const standards = STANDARD_IDS.map((id) => ({ id, name: STANDARDS[id].name, limits: describeStandard(STANDARDS[id]), sources: sourcesFor(id) }));
      const text = standards.map((s) => `${s.id}: ${s.name}\n  ${s.limits.join('\n  ')}`).join('\n') +
        '\nLimits were read on each standard\'s own page on 2026-10-15.';
      return { text, structured: { standards } };
    },
  };

  // Returns the response object for a request, or null for a notification.
  async function handle(msg) {
    const isRequest = msg && typeof msg === 'object' && msg.id !== undefined && msg.id !== null;
    const reply = (result) => ({ jsonrpc: '2.0', id: msg.id, result });
    const error = (code, message) => ({ jsonrpc: '2.0', id: isRequest ? msg.id : null, error: { code, message } });

    if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
      return isRequest ? error(-32600, 'Invalid request') : null;
    }
    if (!isRequest) return null; // notifications (initialized, cancelled, ...) need no reply

    const params = msg.params || {};
    switch (msg.method) {
      case 'initialize': {
        const asked = params.protocolVersion;
        return reply({
          protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'caption-checker', title: 'Caption Checker', version, websiteUrl: 'https://www.markstudios.com/tools/caption-checker' },
          instructions:
            'Use check_captions to check an SRT or WebVTT file against Netflix, BBC or DCMP caption limits, ' +
            'fix_captions to get a copy fixed to those limits without changing any words, ' +
            'and list_standards to see each limit and its source.',
        });
      }
      case 'ping':
        return reply({});
      case 'tools/list':
        return reply({ tools: TOOLS });
      case 'tools/call': {
        const tool = tools[params.name];
        if (!tool) return error(-32602, `Unknown tool: ${params.name}`);
        try {
          const out = await tool(params.arguments || {});
          const content = [{ type: 'text', text: out.text }];
          if (out.extra !== undefined) content.push({ type: 'text', text: out.extra });
          return reply({ content, structuredContent: out.structured, isError: false });
        } catch (err) {
          if (!(err instanceof ToolError)) throw err;
          return reply({ content: [{ type: 'text', text: err.message }], isError: true });
        }
      }
      default:
        return error(-32601, `Method not found: ${msg.method}`);
    }
  }

  return { handle };
}

// Serve on stdio until stdin closes. Logs go to stderr; stdout carries only protocol messages.
function serve({ input = process.stdin, output = process.stdout, ...opts } = {}) {
  const server = createServer(opts);
  let buf = '';
  let pending = Promise.resolve();
  const send = (obj) => output.write(JSON.stringify(obj) + '\n');

  input.setEncoding('utf8');
  input.on('data', (chunk) => {
    buf += chunk;
    let nl;
    while ((nl = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        pending = pending.then(() => send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }));
        continue;
      }
      // Answer in arrival order.
      pending = pending.then(async () => {
        try {
          const res = await server.handle(msg);
          if (res) send(res);
        } catch (err) {
          process.stderr.write(`caption-checker mcp: ${err.stack || err}\n`);
          if (msg && msg.id !== undefined && msg.id !== null) send({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: 'Internal error' } });
        }
      });
    }
  });
  return new Promise((resolve) => input.on('end', () => pending.then(resolve)));
}

module.exports = { createServer, serve, TOOLS, PROTOCOL_VERSIONS };
