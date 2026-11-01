# ADR: caption-checker — check captions locally against published limits, serve over MCP

**Author:** Mark Santos (Mark Studios)
**Date:** 2026-10-20
**Status:** Accepted

## Context

The PRD asks for caption checks against Netflix, BBC and DCMP limits that run anywhere Claude Code runs, cost nothing and never send a client's captions anywhere. The limits are small and fixed (a handful of numbers per standard), but they mix units (characters a second, words a minute, frames at a given frame rate), and some are requirements while others are advice.

## Decision

We keep each standard's limits in one table in `index.js`, read from the standard's own page and dated, and check parsed captions against it with pure functions. The same code backs the CLI, the library and a dependency-free MCP server (`--mcp`) with five tools: `check_captions`, `fix_captions`, `convert_captions`, `retime_captions` and `list_standards`. Each reads a caption file (or pasted text) and returns text; none writes a file, runs a command or opens a connection. Three skills tell the agent which standard fits, how to report a check, and what the fix, convert and retime tools change.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Ask the model to read the file and judge | Can't do frame arithmetic reliably across hundreds of captions, and can't cite a limit |
| A hosted checking API | Uploads client captions, needs a key and a network, and adds a service to run |
| Build on the official MCP SDK | Adds a dependency tree for a protocol subset small enough to implement directly (`mcp.js`, about 350 lines) |

## Consequences

**Positive:**

- Private and free: captions never leave the machine; no key, no network.
- Nothing to install beyond Node 18; `npx` runs it straight from GitHub, and the CLI's exit code works in CI.
- The checking logic is the browser tool's, so the web page, CLI and MCP server apply the same limits.

**Negative / accepted tradeoffs:**

- Limits are dated (read 2026-10-15). If a standard changes its page, the table has to be updated by hand.
- Gap results depend on the frame rate; when the user doesn't know it, the check assumes 24 fps and says so.
- The hand-written protocol layer has to track MCP spec revisions; it currently negotiates four protocol versions.

## Tool-permission scope

| Skill | Tools it declares | Why |
| --- | --- | --- |
| caption-checker | `check_captions`, `list_standards` | Reads one caption file (or pasted text) and reports each limit it breaks; lists each standard's limits and sources |
| caption-fixer | `fix_captions`, `check_captions` | Returns a fixed copy as text (lines rewrapped, out-times moved, no word or in-time changed) and re-checks it |
| caption-converter | `convert_captions`, `retime_captions`, `check_captions` | Returns the file in the other format, or retimed, as text |

Each tool is declared twice, as `mcp__plugin_caption-checker_caption-checker__<tool>` (plugin install) and `mcp__caption-checker__<tool>` (`claude mcp add`). All five tools only read their input and return text.

No `Bash`, `Read` or `Write` permission is declared by any skill. Saving a fixed, converted or retimed file goes through the agent's usual permission prompt, and the CLI fallback runs only if the user approves the command. The CLI writes a file only to the path the user passes with `--fix` or `--out`.
