---
name: caption-checker
description: Use when the user wants an SRT or WebVTT caption or subtitle file checked before it ships, asks whether captions read too fast, have lines that are too long or break Netflix, BBC or DCMP Captioning Key rules, or wants caption QA in CI. Trigger with "check these captions", "are my subtitles too fast?" or "will this SRT pass Netflix's spec?".
version: 1.3.1
author: Mark Studios <contact@markstudios.com>
license: MIT
compatibility: Claude Code with the caption-checker plugin or MCP server; any agent that can run Node 18+ for the CLI fallback. Works offline.
allowed-tools: mcp__plugin_caption-checker_caption-checker__check_captions, mcp__plugin_caption-checker_caption-checker__list_standards, mcp__caption-checker__check_captions, mcp__caption-checker__list_standards
tags: [captions, subtitles, srt, webvtt, accessibility, video, mcp]
---

# Checking captions against a published standard

## Overview

This skill checks an SRT or WebVTT file against one of three published caption standards and reports each caption that breaks a limit: **Netflix English** (adult or children's programs), the **BBC subtitle guidelines**, or the **DCMP Captioning Key** (lower, middle or upper level). It catches reading speed, characters a line, lines a caption, shortest and longest time on screen, gaps between captions, overlaps and timing lines that can't be read.

It uses the two tools of the caption-checker MCP server, which ships with the plugin. Nothing leaves the machine: the check runs locally with no key and no upload.

## Prerequisites

- The caption-checker MCP server (installed with the plugin, or `claude mcp add caption-checker -- npx -y github:markksantos/caption-checker --mcp`). Without it, use the CLI in the Examples section, which needs Node 18+.
- A caption file the agent can read, or its text pasted into the chat.

## Instructions

1. **Pick the standard.** Netflix (`netflix`) is the default. Use `netflix-kids` for children's programs, `bbc` for UK broadcast or BBC delivery, and a `dcmp-*` level (`dcmp-lower` 130, `dcmp-middle` 140, `dcmp-upper` 160 words a minute) for US educational media, matched to the audience level the user names. If the user names a platform without a standard, say which one you used.
2. **Run `check_captions`** with `path` (a file on disk) or `text` (pasted captions), plus `standard`. Pass `fps` when the video isn't 24 fps, because Netflix's minimum gap is counted in frames. Pass `vertical: true` for 9:16 video, where the BBC allows three lines.
3. **Report the result.** Lead with the count line ("6 of 8 captions meet…"), then the flagged captions with their timecodes. Group repeats ("14 captions run over 20 characters a second") rather than listing hundreds of lines.
4. **Suggest fixes that keep the words.** Split a long caption across two, extend its out-time into a gap, or merge a flash caption into its neighbor. Only shorten the wording if the user asks for edited captions. When the user wants the file fixed, not just checked, use the caption-fixer skill: `fix_captions` does the rewrapping and out-time moves itself.
5. Use `list_standards` when the user asks what a limit is or where it comes from.

## Output

- `check_captions` returns the count line, then each caption with issues: number, in and out time, its text, and one line per issue marked LIMIT or advice. The structured result has every issue, counts by kind and the averages.
- Advice items are things a standard recommends rather than requires (the BBC's 0.3 s a word, its 1 s minimum gap). Report them as suggestions, never as failures.

## Error Handling

- **"No captions found"**: the file has no timing lines in SRT or WebVTT form (`00:00:01,000 --> 00:00:03,500`). Other formats (SCC, TTML, ASS) aren't read; ask for an SRT or VTT export.
- **Unreadable timing line**: reported on that caption as a timing issue; the rest of the file is still checked.
- **Wrong frame rate**: gap results depend on `fps`. If the user doesn't know it, say the check assumed 24 fps.
- Limits come from each standard's own page, read on 2026-10-15. A file that passes isn't certified by Netflix, the BBC or DCMP; it meets the numbers they publish.

## Examples

"Check captions.srt against Netflix" → `check_captions` with `path: "captions.srt"`, `standard: "netflix"`. A result looks like this:

```text
2 of 8 captions meet Netflix English, adult programs.
#4  0:07.200 -> 0:09.000  we packed water, snacks, a rain jacket and a spare battery for the cam
    LIMIT: Reading speed 41.1 characters a second (limit 20)
    LIMIT: Line 1 is 74 characters (limit 42)
```

Without the MCP server, the same check runs from a shell, and exits with 1 when a caption breaks a limit, so it works in CI:

```bash
npx -y github:markksantos/caption-checker captions.srt
npx -y github:markksantos/caption-checker captions.vtt --standard bbc --vertical --json
```

## Resources

- [Free online caption checker](https://www.markstudios.com/tools/caption-checker): the same checker in the browser, no install and no upload, with an embed code for course and accessibility pages.
- [Caption reading speed study](https://www.markstudios.com/research/caption-reading-speed-study): 339,521 captions in 387 NASA videos and MIT OpenCourseWare lectures measured with this checker against all three standards.
- Source, CLI flags and the library API: https://github.com/markksantos/caption-checker
- Built by [Mark Studios](https://www.markstudios.com), a video editing studio for YouTube and [short-form video](https://www.markstudios.com/services/video-editing/short-form).
