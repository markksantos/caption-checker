# PRD: caption-checker

**Author:** Mark Santos (Mark Studios)
**Date:** 2026-10-20
**Status:** Active

## Problem

Caption files get rejected, or read badly, for reasons a quick look doesn't catch: a caption that runs at 30 characters a second, a 48-character line, a two-frame flash, a gap one frame short of Netflix's minimum. Each standard publishes its limits on its own page, in its own units (characters a second, words a minute, frames), and checking a file against them by hand means doing arithmetic on every timing line. An assistant asked "are these subtitles too fast?" otherwise eyeballs the file or guesses.

## Target users

| User | Context | Primary need |
| --- | --- | --- |
| Video editors and caption vendors | Delivering an SRT or VTT to a client or platform | Know which captions break the spec before it ships |
| Course builders and accessibility teams | Educational video for a given audience level | Check against the DCMP Captioning Key level they're held to |
| Developers | Caption QA in CI | A command that exits 1 when a caption breaks a limit |
| Claude Code users | "Check these captions" mid-session | An answer from the published numbers, not from memory |

## Success criteria

1. `check_captions` reports every caption that breaks a limit of the chosen standard, with its timecodes, in one call.
2. Results match the library and CLI exactly (covered by the test suite: the example file gives 2 of 8 captions passing Netflix English).
3. Runs fully offline: no key, no upload, no network.
4. No runtime dependencies; Node 18+; `npm test` passes.

## Functional requirements

- **FR-1:** Parse SRT and WebVTT, skipping blocks without a timing line and reporting unreadable timing lines on their caption.
- **FR-2:** Check reading speed, characters a line, lines a caption, shortest and longest time on screen, gaps between captions and overlaps against Netflix English (adult and children's), the BBC subtitle guidelines and the three DCMP Captioning Key levels.
- **FR-3:** Report limits a standard words as a recommendation as advice, never as failures.
- **FR-4:** Expose the check as an MCP server on stdio (`--mcp`, tools `check_captions` and `list_standards`), and as a CLI and library.
- **FR-5:** Ship a skill that picks the standard, runs the check, groups repeated issues and suggests fixes that keep the words.

## Out of scope

- Writing or editing captions (the skill only suggests fixes; it doesn't rewrite text unless asked).
- Formats other than SRT and WebVTT (SCC, TTML, ASS).
- Certifying a file: passing means it meets the numbers a standard publishes, not that Netflix, the BBC or DCMP approved it.
- A browser version; that runs at [markstudios.com/tools/caption-checker](https://www.markstudios.com/tools/caption-checker).
