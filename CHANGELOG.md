# Changelog

## 1.2.0 (2026-10-29)

- Fix mode: `caption-check captions.srt --fix fixed.srt`, `fix()` in the library and a `fix_captions` MCP tool. It rewraps lines that are too long or too many (breaking after punctuation where it can and avoiding a break after "the", "and" or "was"), pulls out-times off overlaps and gaps under the minimum, cuts captions to the longest time on screen, and extends out-times into free time when a caption is too short or reads too fast. It never changes a word or an in-time, leaves every other byte of the file as it was, and lists what it couldn't fix (a caption with no free time after it, or one too long for the lines allowed) for a person.
- A second skill, `skills/caption-fixer/SKILL.md`, for agents asked to fix a caption file rather than check it.

## 1.1.0 (2026-10-19)

- MCP server: `caption-check --mcp` serves two tools over stdio, `check_captions` (a file path or pasted SRT/VTT text) and `list_standards` (each limit with its source page). No dependencies, no network.
- Claude Code plugin: the repo is its own plugin marketplace (`/plugin marketplace add markksantos/caption-checker`), bundling the MCP server and a caption QA skill (`skills/caption-checker/SKILL.md`).

## 1.0.1 (2026-10-15)

- Fixed: `--json` output for long caption files was cut off at 64 KB when piped to another program, because the CLI exited before stdout drained. It now sets the exit code and lets Node exit on its own.

## 1.0.0 (2026-10-15)

First release.

- Checks SRT and WebVTT caption files against Netflix English (adult and children's programs), the BBC subtitle guidelines and the DCMP Captioning Key (lower, middle and upper levels).
- Flags reading speed (characters a second or words a minute), characters a line, lines a caption, shortest and longest time on screen, gaps between captions, overlaps, empty captions and timing lines that can't be read.
- `--vertical` for 9:16 video (the BBC allows three lines), `--fps` for frame-based gaps, `--json` output, and `--advice` for notes a standard words as a recommendation.
- Exits with 1 when any caption breaks a limit, so it can run as a CI check.
- The same checker runs in the browser at https://www.markstudios.com/tools/caption-checker
