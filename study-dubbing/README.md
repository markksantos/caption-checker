# YouTube dubbing study (2026-10-26)

Scripts and data behind the [YouTube Dubbing Study](https://www.markstudios.com/research/youtube-dubbing-study) on markstudios.com.

**Question:** how many of the most-subscribed YouTube channels publish their latest videos with dubbed audio, in which languages, and are those dubs the channel's own or YouTube's automatic dubbing?

**Sample:** the same 487 videos as the caption-coverage check in [`../study-auto-captions`](../study-auto-captions) (`coverage.jsonl`): the 5 latest regular uploads (2+ minutes, no Shorts) of each channel in Wikipedia's *List of most-subscribed YouTube channels*, revision 1381638413 (Oct 25, 2026). Channels with fewer than 3 readable uploads are left out, which leaves 97 channels and 485 videos.

**Method:** `collect.py` loads every video with [yt-dlp](https://github.com/yt-dlp/yt-dlp) and reads each audio stream. YouTube puts its own track type in the `xtags` parameter of every stream URL (`acont=original`, `acont=dubbed` for a dub the channel uploaded, `acont=dubbed-auto` for YouTube's automatic dubbing). One track per language is kept. Checks: every `dubbed-auto` track on an English video is in the 20 languages YouTube's help page lists for automatic dubbing from English; `dubbed` tracks include languages that list doesn't have (Turkish, Thai, Vietnamese, Chinese); 25 random videos without dubs were reloaded and still had none.

| File | What it is |
|---|---|
| `collect.py` | collector; resumable, retries failed loads (YouTube rate-limits after ~400 requests) |
| `dub.jsonl` | one row per video: audio tracks by language with their `acont` tag, title, upload date, duration, views |
| `channels_meta.py` / `channels-meta.json` | each channel's category and country from the same Wikipedia revision |
| `analyze.py` | `python3 analyze.py dub.json`: per-channel table, headline counts, channel vs YouTube split, captions cross-check |
| `dub.json` | the analysis output the page is built from |

Headline results: 39 of 97 channels had dubbed audio on their latest videos (21 on all five); 149 of 485 videos; 1,174 of 1,582 dub tracks (74%) uploaded by the channels, 408 made by YouTube's automatic dubbing; median 13 languages on a video with channel-made dubs; 74 of 75 auto-dubbed videos had no captions uploaded by the channel.

Measurements are free to reuse under CC BY 4.0 with a link to the study page. The videos and their audio belong to the channels that published them.
