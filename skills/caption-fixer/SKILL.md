---
name: caption-fixer
description: Use when the user wants an SRT or WebVTT caption or subtitle file fixed so it meets Netflix, BBC or DCMP Captioning Key limits, not just checked - lines too long, too many lines, overlapping subtitles, gaps under the minimum, captions on screen too briefly or reading too fast. Trigger with "fix these captions", "make this SRT pass Netflix's spec", "rewrap my subtitles to 42 characters" or "fix the overlapping subtitles".
version: 1.3.1
author: Mark Studios <contact@markstudios.com>
license: MIT
compatibility: Claude Code with the caption-checker plugin or MCP server; any agent that can run Node 18+ for the CLI fallback. Works offline.
allowed-tools: mcp__plugin_caption-checker_caption-checker__fix_captions, mcp__plugin_caption-checker_caption-checker__check_captions, mcp__caption-checker__fix_captions, mcp__caption-checker__check_captions, Write
tags: [captions, subtitles, srt, webvtt, accessibility, video, mcp]
---

# Fixing captions to a published standard

## Overview

This skill fixes an SRT or WebVTT file to one of three published caption standards (**Netflix English**, the **BBC subtitle guidelines** or the **DCMP Captioning Key**) without changing a word of the captions or the moment any caption appears. It uses the `fix_captions` tool of the caption-checker MCP server, which ships with the plugin, and runs locally with no key and no upload.

What `fix_captions` changes:

- **Line breaks.** A caption with a line over the character limit, or with too many lines, is rewrapped into the fewest lines that fit. Breaks go after punctuation where possible and avoid landing right after an article, preposition, conjunction or auxiliary verb.
- **Out-times.** An out-time is pulled back off an overlap or a gap under the minimum, cut to the longest time on screen, and pushed into the free time after a caption that is on screen too briefly or reads too fast. For Netflix, gaps under half a second are closed to 2 frames.

What it never changes: the words, any in-time, the number of captions, cue ids, WebVTT headers, NOTE blocks, cue settings and line endings. A caption that needed nothing keeps its exact bytes.

## Prerequisites

- The caption-checker MCP server (installed with the plugin, or `claude mcp add caption-checker -- npx -y github:markksantos/caption-checker --mcp`). Without it, use the CLI in the Examples section, which needs Node 18+.
- A caption file the agent can read and a place to write the fixed copy.

## Instructions

1. **Pick the standard and frame rate** as the caption-checker skill does: `netflix` by default, `netflix-kids` for children's programs, `bbc` for UK broadcast, a `dcmp-*` level for US educational media. Pass `fps` when the video isn't 24 fps, since Netflix's minimum gap is 2 frames, and `vertical: true` for 9:16 video.
2. **Run `fix_captions`** with `path` (or `text`), `standard`, `fps` and `vertical`. The first content item is the report; the second is the fixed file.
3. **Save the fixed file next to the original**, with `.fixed` before the extension (`captions.fixed.srt`). Overwrite the original only when the user asks for that.
4. **Report** the before-and-after line ("6 of 8 captions now meet Netflix English (before: 2)") and the kinds of change, grouped ("rewrapped 14 captions, moved 31 out-times"), not every line.
5. **Hand over what's left.** Each caption in "Left for a person" has a reason. Suggest a concrete fix for each that keeps the words: split a caption that reads too fast at a natural pause into two, merge a flash caption into its neighbor, or move the next caption's in-time if it's late against the audio. Rewrite wording only if the user asks for edited captions; condensing is an editorial call.
6. **Confirm** by running `check_captions` on the saved file when the user wants proof it passes.

## Output

- The report: the count line, one line per change (`#5  Out-time 0:17.000 -> 0:16.100 (off an overlap, to the 7 s maximum)`), then the captions left for a person with a reason each.
- The structured result has `changes`, `unresolved`, `flaggedBefore`, `flaggedAfter` and the fixed text as `fixed`.

## Error Handling

- **"No captions found"**: the text has no SRT or WebVTT timing lines. Other formats (SCC, TTML, ASS) aren't read; ask for an SRT or VTT export.
- **"Has formatting tags or two speakers"**: italics, positioning codes and dialogue dashes are left alone rather than risk breaking them. Rewrap those by hand.
- **"Too long for 2 lines"**: the words don't fit the lines allowed. It needs splitting into two captions, which means choosing a new in-time against the audio, so it stays with a person.
- **Unreadable or out-of-order timing**: reported, and that caption's timing is left as it was.

## Examples

"Fix travel-vlog.srt for Netflix" → `fix_captions` with `path: "travel-vlog.srt"`, `standard: "netflix"` (24 fps), then write the second content item to `travel-vlog.fixed.srt`. The report:

```text
8 changes. 6 of 8 captions now meet Netflix English, adult programs (before: 2).
#1  Out-time 0:03.000 -> 0:02.916 (to leave 2 frames before the next caption)
#4  Rewrapped to 2 lines (38 + 35 characters)
#6  Rewrapped to 2 lines (29 + 16 characters)
Left for a person (2):
#3  Still on screen only 0.52 s (minimum 5/6 of a second) with no free time after it: merge it with a neighbor or move the next caption
#4  Still reads at 40.2 characters a second (limit 20) with no free time after it: split it, condense it or move the next caption
```

Without the MCP server, the CLI writes the fixed copy and prints the same report. It exits with 1 while any caption still breaks a limit:

```bash
npx -y github:markksantos/caption-checker captions.srt --fix captions.fixed.srt --fps 25
npx -y github:markksantos/caption-checker captions.vtt --fix captions.fixed.vtt --standard bbc --vertical
```

## Resources

- [Free online caption checker](https://www.markstudios.com/tools/caption-checker): check a file in the browser, no install and no upload.
- [Caption reading speed study](https://www.markstudios.com/research/caption-reading-speed-study): how fast 339,521 captions in NASA videos and MIT OpenCourseWare lectures read, measured with this checker.
- Source, CLI flags and the library API: https://github.com/markksantos/caption-checker
- Built by [Mark Studios](https://www.markstudios.com), a video editing studio that also edits [white-label for agencies](https://www.markstudios.com/services/white-label-video-editing), captions included.
