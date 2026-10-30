/* Vendored unchanged from the Mark Studios site (assets/tools/subtitle-core.js at 1735a9163): the SubRip and WebVTT reader and
 writer behind https://www.markstudios.com/tools/srt-vtt-converter and /tools/subtitle-time-shift, so the CLI, the MCP
 server and the online tools convert and retime a file the same way, byte for byte. Only these wrapper lines are new;
 the browser-only helpers (readFile, download) are never called here. */
'use strict';
const window = {};

/* Shared SubRip (.srt) and WebVTT (.vtt) reading and writing for the caption tools: the caption checker, the SRT/VTT
   converter, the subtitle time shifter and the SRT editor. Everything runs in the page; nothing is uploaded.
   SubRip has no formal specification. Its de-facto form (Library of Congress format description fdd000569): a caption
   number, a HH:MM:SS,mmm --> HH:MM:SS,mmm line, one or more text lines, a blank line. SubRip itself writes Windows-1252
   by default, so a reader has to detect the character set.
   WebVTT follows the W3C Candidate Recommendation Draft of 20 May 2026: a WEBVTT header, optional unique cue
   identifiers, (HH:)MM:SS.mmm timings with optional cue settings, cues in start-time order, and cue text in which
   & and < are written as character references (&amp; &lt;). */
(function (root) {
  'use strict';

  function stamp(t) {  // 00:01:02,345 · 01:02.345 · 1:02:03.4 → seconds
    var m = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})[,.](\d{1,3})$/.exec(t.trim());
    if (!m) return NaN;
    return (+(m[1] || 0)) * 3600 + (+m[2]) * 60 + (+m[3]) + (+(m[4] + '00').slice(0, 3)) / 1000;
  }
  function toMs(sec) { return isFinite(sec) ? Math.round(sec * 1000) : NaN; }
  function clean(line) {  // what a viewer reads: no tags, position codes or entities
    return line.replace(/\{\\[^}]*\}/g, '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+$/, '');
  }

  var TIMING = /^\s*((?:\d+:)?\d{1,2}:\d{1,2}[,.]\d{1,3})\s*-->\s*((?:\d+:)?\d{1,2}:\d{1,2}[,.]\d{1,3})/;

  function parse(src, name) {
    var bom = /^\uFEFF/.test(src), eol = /\r\n/.test(src) ? '\r\n' : '\n';
    var text = src.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n'), vtt = /^WEBVTT\b/.test(text.trim());
    var blocks = text.split(/\n[ \t]*\n/), cues = [], bad = [], fmt = [], meta = [];
    var dotted = 0, commas = 0;
    function timingAt(lines) {
      for (var i = 0; i < Math.min(lines.length, 3); i++) if (lines[i].indexOf('-->') > -1) return i;
      return -1;
    }
    blocks.forEach(function (b) {
      var lines = b.split('\n');
      while (lines.length && !lines[0].trim()) lines.shift();
      while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
      if (!lines.length) return;
      var head = /^(WEBVTT|NOTE|STYLE|REGION)\b/.exec(lines[0].trim());
      if (head) { meta.push({ type: head[1], lines: lines, at: cues.length }); return; }
      var ti = timingAt(lines);
      if (ti < 0) { bad.push(lines[0].trim().slice(0, 60)); return; }
      // A cue run into this one with no blank line starts at its own timing line (or the SubRip number just above it).
      // It becomes a cue of its own, so writing the file back out keeps its timing, and the cue above is flagged.
      var from = 0, cur = ti;
      for (var k = ti + 1; k < lines.length; k++) {
        if (!TIMING.test(lines[k])) continue;
        var at = k - 1 > cur && /^\s*\d+\s*$/.test(lines[k - 1]) ? k - 1 : k;
        addCue(lines.slice(from, at), lines[k].trim().slice(0, 60));
        from = at; cur = k;
      }
      addCue(from ? lines.slice(from) : lines, null);
    });
    function addCue(lines, joined) {
      var ti = timingAt(lines);
      var m = TIMING.exec(lines[ti]), rest = lines.slice(ti + 1);
      // any other --> line (one that isn't a readable timing line) and a SubRip number above it aren't caption text either
      var own = rest.filter(function (l, k) { return l.indexOf('-->') < 0 && !(/^\s*\d+\s*$/.test(l) && rest[k + 1] && rest[k + 1].indexOf('-->') > -1); });
      var body = own.map(clean).filter(function (l) { return l.trim() !== ''; });
      var start = m ? stamp(m[1]) : NaN, end = m ? stamp(m[2]) : NaN;
      var cue = { n: cues.length + 1, id: ti > 0 ? lines[0].trim() : '', start: start, end: end, startMs: toMs(start), endMs: toMs(end),
                  raw: lines[ti].trim(), lines: body, text: own.map(function (l) { return l.replace(/\s+$/, ''); }),
                  settings: m ? lines[ti].slice(m.index + m[0].length).trim() : '',
                  stamps: m ? [m[1], m[2]] : null, hasId: ti > 0,
                  runTogether: rest.filter(function (l) { return l.indexOf('-->') > -1; }).map(function (l) { return l.trim().slice(0, 60); })
                    .concat(joined ? [joined] : []),
                  tight: m ? !/\s-->\s/.test(lines[ti]) : false };
      if (m) [m[1], m[2]].forEach(function (x) { if (/\./.test(x)) dotted++; else commas++; });
      cues.push(cue);
    }
    // SubRip (.srt) or WebVTT (.vtt): the header decides; without one, the file name, then the timestamps
    var kind = vtt ? 'vtt' : /\.vtt$/i.test(name || '') ? 'vtt' : 'srt';
    if (!vtt && kind === 'vtt') fmt.push('A WebVTT file has to start with the line WEBVTT. Add it as the first line.');
    if (!vtt && kind === 'srt' && dotted && !commas && !/\.srt$/i.test(name || ''))
      fmt.push('The timestamps use periods, as WebVTT does, but there is no WEBVTT line. As an .srt file, use commas (00:00:01,000); as a .vtt file, add WEBVTT as the first line.');
    return { cues: cues, bad: bad, vtt: vtt, kind: kind, fmt: fmt, meta: meta, eol: eol, bom: bom };
  }

  // SubRip: a cue number, then HH:MM:SS,mmm --> HH:MM:SS,mmm. WebVTT: an optional cue id, then (HH:)MM:SS.mmm --> (HH:)MM:SS.mmm.
  function formatChecks(p, add) {
    var srt = p.kind === 'srt', want = srt ? /^\d{2,}:\d{2}:\d{2},\d{3}$/ : /^(?:\d{2,}:)?\d{2}:\d{2}\.\d{3}$/, expect = 1;
    p.cues.forEach(function (c) {
      if (srt) {
        if (!c.hasId) add(c, 'format', 'err', 'No caption number above the timing line. SubRip numbers every caption: 1, 2, 3 and so on.');
        else if (!/^\d+$/.test(c.id)) add(c, 'format', 'err', 'The line above the timing isn’t a caption number: “' + c.id.slice(0, 40) + '”');
        else { if (+c.id !== expect) add(c, 'format', 'note', 'Numbered ' + c.id + ' where ' + expect + ' comes next. Most players accept it, but renumber to keep the file clean.'); expect = +c.id + 1; }
      }
      if (c.stamps) c.stamps.forEach(function (x, j) {
        var which = j ? 'end' : 'start';
        if (want.test(x)) { if (/:([6-9]\d)[:.,]/.test(':' + x)) add(c, 'format', 'err', 'The ' + which + ' time “' + x + '” has minutes or seconds over 59.'); return; }
        if (srt && /\./.test(x)) add(c, 'format', 'err', 'The ' + which + ' time “' + x + '” uses a period. SubRip uses a comma before the milliseconds: ' + x.replace('.', ',') + '.');
        else if (!srt && /,/.test(x)) add(c, 'format', 'err', 'The ' + which + ' time “' + x + '” uses a comma. WebVTT uses a period before the milliseconds: ' + x.replace(',', '.') + '.');
        else add(c, 'format', 'err', 'The ' + which + ' time “' + x + '” isn’t in ' + (srt ? 'HH:MM:SS,mmm form, such as 00:01:02,345' : 'MM:SS.mmm or HH:MM:SS.mmm form, such as 01:02.345') + '.');
      });
      if (c.tight) add(c, 'format', srt ? 'note' : 'err', srt ? 'Put a space on each side of the --> arrow; some players won’t read the timing without them.' : 'WebVTT needs a space on each side of the --> arrow.');
      c.runTogether.forEach(function (l) { add(c, 'format', 'err', 'Two captions run together: put a blank line before “' + l + '”.'); });
    });
  }

  // ---------- writing ----------
  function pad(n, w) { n = String(n); while (n.length < w) n = '0' + n; return n; }
  function ts(ms, kind) {  // integer milliseconds → 00:01:02,345 (SubRip) or 00:01:02.345 (WebVTT; hours kept for a fixed width)
    ms = Math.max(0, Math.round(ms));
    var h = Math.floor(ms / 3600000), m = Math.floor(ms % 3600000 / 60000), s = Math.floor(ms % 60000 / 1000), f = ms % 1000;
    return pad(h, 2) + ':' + pad(m, 2) + ':' + pad(s, 2) + (kind === 'vtt' ? '.' : ',') + pad(f, 3);
  }
  function bump(notes, k, n) { notes[k] = (notes[k] || 0) + (n || 1); }

  // SubRip {\anN} (numpad: 7 8 9 top, 4 5 6 middle, 1 2 3 bottom) ↔ WebVTT line/align settings
  var AN_ROW = { 7: 'top', 8: 'top', 9: 'top', 4: 'mid', 5: 'mid', 6: 'mid', 1: '', 2: '', 3: '' };
  var AN_COL = { 7: 'left', 4: 'left', 1: 'left', 9: 'right', 6: 'right', 3: 'right' };
  function anToSettings(n) {
    var s = [];
    if (AN_ROW[n] === 'top') s.push('line:0'); else if (AN_ROW[n] === 'mid') s.push('line:50%');
    if (AN_COL[n]) s.push('align:' + AN_COL[n]);
    return s.join(' ');
  }
  function settingsToAn(settings, notes) {
    if (!settings) return 0;
    var row = 'bot', col = 'mid', other = 0;
    settings.split(/\s+/).forEach(function (kv) {
      var p = kv.split(':'), k = p[0], v = p.slice(1).join(':');
      if (k === 'line') {
        var pct = /%$/.test(v), n = parseFloat(v);
        if (!isFinite(n)) { other++; return; }
        if (pct ? n <= 20 : (n >= 0 && n <= 1)) row = 'top'; else if (pct && n > 30 && n < 70) row = 'mid';
      } else if (k === 'align') {
        if (v === 'left' || v === 'start') col = 'left'; else if (v === 'right' || v === 'end') col = 'right';
      } else other++;
    });
    if (other) bump(notes, 'settings');
    var an = (row === 'top' ? 7 : row === 'mid' ? 4 : 1) + (col === 'left' ? 0 : col === 'mid' ? 1 : 2);
    return an === 2 ? 0 : an;
  }

  var KEEP = /^<\/?(i|b|u)(?:\.[^\s>]*)?>$/i;
  function srtLineToVtt(line, notes, pos) {
    line = line.replace(/\{\\an?(\d)\}/g, function (_, d) { if (!pos.an) pos.an = +d; return ''; });
    line = line.replace(/\{\\[^}]*\}/g, function () { bump(notes, 'ass'); return ''; });
    line = line.replace(/<\/?[a-zA-Z][^<>]*>/g, function (tag) {
      if (/^<\/?font\b/i.test(tag)) { if (tag[1] !== '/') bump(notes, 'font'); return ''; }
      if (KEEP.test(tag)) return tag.replace(/\.[^\s>]*/, '').toLowerCase();
      if (tag[1] !== '/') bump(notes, 'tags');
      return '';
    });
    var out = '', parts = line.split(/(<\/?(?:i|b|u)>)/i);
    parts.forEach(function (s, i) {
      if (i % 2) { out += s; return; }
      out += s.replace(/&(?!(?:[a-zA-Z][a-zA-Z0-9]*|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;').replace(/</g, '&lt;').replace(/-->/g, '--&gt;');
    });
    return out;
  }
  var ENT = { amp: '&', lt: '<', gt: '>', nbsp: ' ', lrm: '‎', rlm: '‏', quot: '"', apos: "'" };
  function vttLineToSrt(line, notes, speakers) {
    line = line.replace(/<rt\b[^>]*>[\s\S]*?<\/rt>/gi, function () { bump(notes, 'ruby'); return ''; });
    line = line.replace(/<v(?:\.[^\s>]*)?\s+([^>]+)>/gi, function (_, who) { bump(notes, 'voice'); return speakers ? who.trim() + ': ' : ''; });
    line = line.replace(/<\/?[a-zA-Z][^<>]*>|<\d[\d:.]*>/g, function (tag) {
      if (KEEP.test(tag)) return tag.replace(/\.[^\s>]*/, '').toLowerCase();
      if (/^<\/v\b/i.test(tag) || /^<\/?ruby\b/i.test(tag)) return '';
      if (tag[1] !== '/') bump(notes, /^<\d/.test(tag) ? 'karaoke' : 'tags');
      return '';
    });
    return line.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);/g, function (all, e) {
      if (e[0] === '#') { var c = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return isFinite(c) ? String.fromCodePoint(c) : all; }
      return ENT.hasOwnProperty(e) ? ENT[e] : all;
    });
  }

  /* p: a parse() result. target: 'srt' | 'vtt'. opts: keepIds (SRT→VTT, default true), speakers (VTT→SRT: "Name: " for <v Name>),
     eol ('\n' | '\r\n', default the source's), times (optional function(cue) → [startMs, endMs] for the time shifter and editor).
     Same-format output keeps text, ids, settings and WebVTT header/NOTE/STYLE/REGION blocks exactly as they were.
     Returns { text, notes: {kind: count}, count }. */
  function write(p, target, opts) {
    opts = opts || {};
    var notes = {}, eol = opts.eol || p.eol || '\n', same = target === p.kind;
    var rows = p.cues.filter(function (c) { return isFinite(c.startMs) && isFinite(c.endMs); });
    if (rows.length < p.cues.length) bump(notes, 'untimed', p.cues.length - rows.length);
    rows = rows.map(function (c) {
      var t = opts.times ? opts.times(c) : [c.startMs, c.endMs];
      return { c: c, s: Math.max(0, Math.round(t[0])), e: Math.max(0, Math.round(t[1])), neg: t[0] < 0 || t[1] < 0 };
    });
    rows.forEach(function (r) { if (r.neg) bump(notes, 'clamped'); });
    if (target === 'vtt') {
      var sorted = rows.slice().sort(function (a, b) { return a.s - b.s; });
      if (sorted.some(function (r, i) { return r !== rows[i]; })) bump(notes, 'reordered');
      rows = sorted;
    }
    var ids = {}, dupIds = false;
    if (target === 'vtt' && !same && opts.keepIds !== false) rows.forEach(function (r) { var id = r.c.id; if (!id || ids[id]) dupIds = true; ids[id] = 1; });
    var built = rows.map(function (r, i) {
      var c = r.c, lines = [], text, settings = '';
      if (target === 'srt') {
        if (same) text = c.text.slice();
        else {
          var an = settingsToAn(c.settings, notes);
          text = c.text.map(function (l) { return vttLineToSrt(l, notes, opts.speakers); });
          if (an) { bump(notes, 'positions'); text[0] = '{\\an' + an + '}' + (text[0] || ''); }
          if (p.kind === 'vtt' && c.id && !/^\d+$/.test(c.id)) bump(notes, 'ids');
        }
        lines.push(ts(r.s, 'srt') + ' --> ' + ts(r.e, 'srt'));
      } else {
        if (same) { if (c.id) lines.push(c.id); settings = c.settings; text = c.text.slice(); }
        else {
          if (opts.keepIds !== false) lines.push(dupIds ? String(i + 1) : c.id);
          var pos = {};
          text = c.text.map(function (l) { return srtLineToVtt(l, notes, pos); });
          if (pos.an) { var st = anToSettings(pos.an); if (st) { settings = st; bump(notes, 'positions'); } }
        }
        lines.push(ts(r.s, 'vtt') + ' --> ' + ts(r.e, 'vtt') + (settings ? ' ' + settings : ''));
      }
      if (target === 'srt' && !same && !text.some(function (l) { return l.trim() !== ''; })) { bump(notes, 'empty'); return null; }
      return { head: lines, text: text };
    }).filter(Boolean);
    // SubRip numbers the captions it writes 1, 2, 3 in order
    var blocks = built.map(function (b, i) { return (target === 'srt' ? [String(i + 1)] : []).concat(b.head, b.text).join(eol); });
    var out;
    if (target === 'vtt') {
      var header = 'WEBVTT', before = [], within = {};
      if (same) p.meta.forEach(function (m) {
        if (m.type === 'WEBVTT') header = m.lines.join(eol);
        else if (m.type === 'STYLE' || m.type === 'REGION' || m.at === 0) before.push(m.lines.join(eol));
        else (within[m.at] = within[m.at] || []).push(m.lines.join(eol));
      });
      else if (p.meta.length) bump(notes, 'meta', p.meta.length);
      var parts = [header].concat(before);
      blocks.forEach(function (b, i) { if (within[i]) parts = parts.concat(within[i]); parts.push(b); });
      out = parts.join(eol + eol);
    } else {
      if (!same) { var dropped = p.meta.filter(function (m) { return m.type !== 'WEBVTT'; }).length; if (dropped) bump(notes, 'meta', dropped); }
      out = blocks.join(eol + eol);
    }
    return { text: out + eol, notes: notes, count: blocks.length };
  }

  // Read a dropped or opened file as text: UTF-8, or Windows-1252 when UTF-8 decoding would mangle it (SubRip's default).
  function readFile(file, cb) {
    var rd = new FileReader();
    rd.onload = function () {
      var buf = new Uint8Array(rd.result), label = 'UTF-8', txt;
      if (buf[0] === 0xFF && buf[1] === 0xFE) { txt = new TextDecoder('utf-16le').decode(buf); label = 'UTF-16'; }
      else if (buf[0] === 0xFE && buf[1] === 0xFF) { txt = new TextDecoder('utf-16be').decode(buf); label = 'UTF-16'; }
      else {
        try { txt = new TextDecoder('utf-8', { fatal: true }).decode(buf); }
        catch (e) { txt = new TextDecoder('windows-1252').decode(buf); label = 'Windows-1252'; }
      }
      cb(txt.replace(/^\uFEFF/, ''), label);
    };
    rd.readAsArrayBuffer(file);
  }
  function download(name, text, kind) {
    var blob = new Blob([text], { type: kind === 'vtt' ? 'text/vtt;charset=utf-8' : 'application/x-subrip;charset=utf-8' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function baseName(name) { return (name || 'captions').replace(/\.(srt|vtt|txt)$/i, ''); }

  root.MSSubs = { stamp: stamp, toMs: toMs, clean: clean, parse: parse, formatChecks: formatChecks, ts: ts, write: write,
                  readFile: readFile, download: download, baseName: baseName, anToSettings: anToSettings };
})(window);

module.exports = window.MSSubs;
