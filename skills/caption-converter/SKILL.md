---
name: caption-converter
description: Use when the user wants an SRT or WebVTT caption or subtitle file converted to the other format, or its timing fixed because it is out of sync with the video - captions that are all early or late, late from a certain point on, drifting later and later (a frame-rate mismatch such as 23.976 vs 25 fps), or that need re-syncing to two known points. Trigger with "convert this SRT to VTT", "make a WebVTT file for my HTML5 player", "the subtitles are 2 seconds late", "the captions drift out of sync", "shift these subtitles" or "sync the subtitles to the video".
version: 1.3.1
author: Mark Studios <contact@markstudios.com>
license: MIT
compatibility: Claude Code with the caption-checker plugin or MCP server; any agent that can run Node 18+ for the CLI fallback. Works offline.
allowed-tools: mcp__plugin_caption-checker_caption-checker__convert_captions, mcp__plugin_caption-checker_caption-checker__retime_captions, mcp__plugin_caption-checker_caption-checker__check_captions, mcp__caption-checker__convert_captions, mcp__caption-checker__retime_captions, mcp__caption-checker__check_captions, Write
tags: [captions, subtitles, srt, webvtt, vtt, sync, conversion, video, mcp]
---

# Converting and retiming caption files

## Overview

This skill converts captions between **SubRip (.srt)** and **WebVTT (.vtt)** and fixes timing that is out of sync with the video. It uses two tools of the caption-checker MCP server, which ships with the plugin: `convert_captions` and `retime_captions`. Both run locally with no key and no upload, and both return the new file as text for you to save.

Use WebVTT for HTML5 `<track>` elements, most web players and course platforms. Use SubRip for desktop players, most editing software and YouTube, Vimeo or social uploads that ask for .srt.

## Prerequisites

- The caption-checker MCP server (installed with the plugin, or `claude mcp add caption-checker -- npx -y github:markksantos/caption-checker --mcp`). Without it, use the CLI in the Examples section, which needs Node 18+.
- A caption file the agent can read and a place to write the result.

## Instructions

### Converting

1. **Run `convert_captions`** with `path` (or `text`). It writes the other format unless you pass `to`.
2. **Pass `speakers: true`** when converting WebVTT with voice tags (`<v Ana>`) to SubRip and the speaker names should stay visible as "Ana: ". Without it, the names are dropped, since SubRip has no voice tag.
3. **Save** the second content item next to the original with the new extension (`lecture.srt` → `lecture.vtt`).
4. **Report the notes.** Each one says what the other format couldn't hold, such as font colours (WebVTT styles them with `::cue` CSS instead), NOTE blocks (SubRip has no place for them) or WebVTT position settings with no SubRip code. Mention them in one line each, so the user knows what to restyle.

### Retiming

1. **Work out which kind of drift it is** before changing anything. Ask for, or read from the user's description, when one or two captions should appear:
   - **Everything early or late by the same amount** → `offset`, such as `"2.5"` for later or `"-1.2"` for earlier.
   - **In sync until a point, then off** (an ad break or a cut scene) → `offset` with `from`, the first caption number that is wrong.
   - **"Caption 12 should start at 0:41"** → `start_at: { caption: 12, time: "0:41" }`.
   - **Fine at the start, later and later towards the end** → a frame-rate mismatch. Use `rate` when the rates are known (`{ from: 23.976, to: 25 }`: the rate the captions were timed for, then the video's), or `sync` with two captions near the start and the end and their right start times. The summary says when a sync matches a common frame-rate pair.
2. **Run `retime_captions`** with exactly one of `offset`, `start_at`, `rate` or `sync`. Pass `to` to change format at the same time.
3. **Save** the second content item. Keep the original until the user has checked the new file against the video; don't overwrite it unless asked.
4. **Report** the summary line ("412 of 412 captions moved 2.500 s later") and any captions clamped at 0:00, which happens when an earlier shift pushes the first captions before the video starts. Those need checking against the picture.
5. **Check the result** with `check_captions` if the user wants to know whether the retimed file meets a caption standard: a frame-rate rescale changes durations and gaps slightly.

## Output

- `convert_captions`: a line such as "412 captions converted from SubRip (.srt) to WebVTT (.vtt).", the notes, then the converted file.
- `retime_captions`: the summary line, the notes (clamped captions, format changes), then the retimed file. The structured result has `changed`, `clamped`, `scale` or `offsetMs`, and the file as `retimed`.

## Error Handling

- **"No captions found"**: the text has no SubRip or WebVTT timing lines. Other formats (SCC, TTML, ASS) aren't read; ask for an SRT or VTT export.
- **"Can't read ... as a time"**: times can be seconds (`1.5`), `MM:SS.mmm`, `HH:MM:SS,mmm`, `2m30s` or `750ms`, with `-` for earlier.
- **"There is no caption N"**: caption numbers count the captions in the file from 1, in file order.
- **"The second caption has to start after the first one"**: for `sync`, give the earlier caption first, with the earlier time.
- **Captions out of order in a WebVTT file**: WebVTT requires start-time order, so they are sorted and the notes say so.

## Examples

"These subtitles are 2 seconds late" → `retime_captions` with `path: "episode.srt"`, `offset: "-2"`, then save the second content item as `episode.srt` once the user confirms, or as `episode.synced.srt`.

"Convert lecture.vtt to SRT and keep who's speaking" → `convert_captions` with `path: "lecture.vtt"`, `to: "srt"`, `speakers: true`.

"Caption 1 is right but the last one, number 640, should start at 41:12.5" → `retime_captions` with `sync: [{ caption: 1, time: "<caption 1's current start>" }, { caption: 640, time: "41:12.5" }]`.

The same from a terminal:

```bash
npx github:markksantos/caption-checker episode.srt --shift -2 --out episode.synced.srt
npx github:markksantos/caption-checker lecture.vtt --to srt --speakers --out lecture.srt
npx github:markksantos/caption-checker film.srt --rate 23.976:25 --out film.25fps.srt
npx github:markksantos/caption-checker film.srt --sync 1=0:04.200,640=41:12.5 --to vtt --out film.vtt
```

## Resources

- [Free SRT to VTT converter](https://www.markstudios.com/tools/srt-vtt-converter) and [subtitle time shifter](https://www.markstudios.com/tools/subtitle-time-shift): the same reader and writer in the browser, no install and no upload.
- Source, CLI flags and the library API: https://github.com/markksantos/caption-checker
- Built by [Mark Studios](https://www.markstudios.com), a video editing studio whose [monthly editing plans](https://www.markstudios.com/services/video-editing/monthly-editing-plans) keep each client's caption style on file from video to video.
