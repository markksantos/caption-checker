# YouTube video length study (2026-10-26)

Scripts and data behind the [YouTube Video Length Study](https://www.markstudios.com/research/youtube-video-length-study) on markstudios.com.

**Question:** how long are the latest videos of the most-subscribed YouTube channels, how much of what they upload is Shorts, and does the widely quoted "11.7 minutes" average still describe YouTube?

**Sample:** every channel in Wikipedia's *List of most-subscribed YouTube channels*, revision 1381638413 (Oct 25, 2026), the same list as [`../study-auto-captions`](../study-auto-captions) and [`../study-dubbing`](../study-dubbing) (`coverage-channels.json`). Categories per channel: `channels-meta.json` (from the dubbing study).

**Method:** `collect.py` reads, with [yt-dlp](https://github.com/yt-dlp/yt-dlp) flat listings, the 30 latest entries of each channel's Videos tab (durations included), its latest 30 Shorts and live-stream ids, and the channel's public RSS feed (its 15 latest uploads of any kind, with publish dates). `analyze.py` computes the length figures over channels with 10+ videos with a duration (97 channels, 2,859 videos), classes each RSS upload as a Short, video or stream by the tab it appears on, and counts Shorts as under three minutes (YouTube caps Shorts at three minutes since Oct 15, 2024).

| File | What it is |
|---|---|
| `collect.py` | collector; one row per channel, resumable |
| `length.jsonl` | per channel: Videos-tab entries (id, duration, views, title), Shorts and Streams ids, RSS uploads with dates |
| `analyze.py` | `python3 analyze.py length.json`: medians, means, length bands, upload mix, per-category figures |
| `length.json` | the analysis output the page is built from |

Headline results: median 12.3 minutes and mean 20.6 minutes for the latest long-form videos; 646 of 1,484 latest uploads (44%) were Shorts; 53% of classifiable recent uploads ran under three minutes; music channels a median 3.5 minutes, gaming 26.2. The 11.7-minute figure is Pex's mean of all public YouTube videos as of Dec 31, 2018.

Measurements are free to reuse under CC BY 4.0 with a link to the study page. The videos belong to the channels that published them.
