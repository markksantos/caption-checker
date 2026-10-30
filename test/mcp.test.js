'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { createServer } = require('../mcp.js');

const EXAMPLE = path.join(__dirname, '..', 'examples', 'travel-vlog.srt');
const call = (id, name, args) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });

test('initialize echoes a supported protocol version and advertises tools', async () => {
  const s = createServer();
  const r = await s.handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } } });
  assert.equal(r.result.protocolVersion, '2025-06-18');
  assert.deepEqual(r.result.capabilities, { tools: { listChanged: false } });
  assert.equal(r.result.serverInfo.name, 'caption-checker');
  const r2 = await s.handle({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '1999-01-01' } });
  assert.equal(r2.result.protocolVersion, '2025-11-25');
});

test('notifications get no reply; unknown methods get -32601', async () => {
  const s = createServer();
  assert.equal(await s.handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
  assert.equal((await s.handle({ jsonrpc: '2.0', id: 'x', method: 'resources/list' })).error.code, -32601);
  assert.deepEqual((await s.handle({ jsonrpc: '2.0', id: 3, method: 'ping' })).result, {});
});

test('tools/list returns all five tools with object input schemas', async () => {
  const { result } = await createServer().handle({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
  assert.deepEqual(result.tools.map((t) => t.name), ['check_captions', 'fix_captions', 'convert_captions', 'retime_captions', 'list_standards']);
  for (const t of result.tools) assert.equal(t.inputSchema.type, 'object');
});

test('check_captions by path matches the library result', async () => {
  const { result } = await createServer().handle(call(1, 'check_captions', { path: EXAMPLE, standard: 'netflix', fps: 24 }));
  assert.equal(result.isError, false);
  assert.equal(result.structuredContent.captions, 8);
  assert.equal(result.structuredContent.flagged, 6);
  assert.match(result.content[0].text, /^2 of 8 captions meet Netflix English, adult programs\./);
  assert.match(result.content[0].text, /Reading speed 41\.1 characters a second/);
});

test('check_captions by text, BBC vertical, and argument errors', async () => {
  const s = createServer();
  const text = fs.readFileSync(EXAMPLE, 'utf8');
  const ok = await s.handle(call(1, 'check_captions', { text, standard: 'bbc', vertical: true }));
  assert.equal(ok.result.structuredContent.standard, 'bbc');
  assert.equal(ok.result.structuredContent.counts.lines, undefined); // three lines allowed on 9:16
  const both = await s.handle(call(2, 'check_captions', { text, path: EXAMPLE }));
  assert.equal(both.result.isError, true);
  const bad = await s.handle(call(3, 'check_captions', { text, standard: 'itv' }));
  assert.equal(bad.result.isError, true);
  const missing = await s.handle(call(4, 'check_captions', { path: '/nope/missing.srt' }));
  assert.equal(missing.result.isError, true);
  assert.match(missing.result.content[0].text, /Can't read/);
  const empty = await s.handle(call(5, 'check_captions', { text: 'hello' }));
  assert.match(empty.result.content[0].text, /No captions found/);
});

test('list_standards names every standard with its source', async () => {
  const { result } = await createServer().handle(call(1, 'list_standards', {}));
  const ids = result.structuredContent.standards.map((s) => s.id);
  assert.deepEqual(ids, ['netflix', 'netflix-kids', 'bbc', 'dcmp-upper', 'dcmp-middle', 'dcmp-lower']);
  for (const s of result.structuredContent.standards) assert.ok(s.sources.length && s.limits.length);
});

test('the CLI serves MCP over stdio', async () => {
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'bin', 'caption-check.js'), '--mcp']);
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }) + '\n');
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  child.stdin.write(JSON.stringify(call(2, 'check_captions', { path: EXAMPLE })) + '\n');
  child.stdin.end();
  await new Promise((resolve) => child.on('close', resolve));
  const msgs = out.trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(msgs.length, 2);
  assert.equal(msgs[0].result.serverInfo.name, 'caption-checker');
  assert.equal(msgs[1].result.structuredContent.flagged, 6);
});

test('convert_captions returns the WebVTT file as the second content item', async () => {
  const { result } = await createServer().handle(call(1, 'convert_captions', { path: EXAMPLE }));
  assert.equal(result.isError, false);
  assert.match(result.content[0].text, /^8 captions converted from SubRip \(\.srt\) to WebVTT \(\.vtt\)\./);
  assert.match(result.content[1].text, /^WEBVTT\n\n1\n00:00:00\.500 --> 00:00:03\.000\n/);
  assert.equal(result.structuredContent.converted, result.content[1].text);
});

test('retime_captions shifts, rescales and reports bad input as a tool error', async () => {
  const s = createServer();
  const r = (await s.handle(call(1, 'retime_captions', { path: EXAMPLE, offset: '1.5', from: 2 }))).result;
  assert.equal(r.structuredContent.changed, 7);
  assert.equal(r.structuredContent.offsetMs, 1500);
  assert.match(r.content[1].text, /^1\n00:00:00,500 --> 00:00:03,000\n/);
  const k = (await s.handle(call(2, 'retime_captions', { path: EXAMPLE, rate: { from: 25, to: 23.976 } }))).result;
  assert.ok(Math.abs(k.structuredContent.scale - 25 / 23.976) < 1e-12);
  const bad = (await s.handle(call(3, 'retime_captions', { path: EXAMPLE, offset: 'soon' }))).result;
  assert.equal(bad.isError, true);
  assert.match(bad.content[0].text, /can't read "soon" as a time/);
  const none = (await s.handle(call(4, 'retime_captions', { path: EXAMPLE }))).result;
  assert.equal(none.isError, true);
});
