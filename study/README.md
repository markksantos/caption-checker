# Caption reading speed study (2026-10-15)

The data and code behind [markstudios.com/research/caption-reading-speed-study](https://www.markstudios.com/research/caption-reading-speed-study): every caption in 387 public videos (139 NASA videos dated 2025-2026, 248 MIT OpenCourseWare lectures from 47 courses; 339,521 captions) run through this repository's own `parse()` and `check()` against the Netflix, BBC and DCMP limits.

| File | What it is |
|---|---|
| `collect.py` | Downloads the caption files. NASA: every video in the NASA Image and Video Library API dated 2025 or later, shuffled with seed 20261015, first 250 with an .srt file. MIT OCW: courses from the sitemap index shuffled with the same seed, courses with a video gallery, up to 6 lecture .vtt files each, until 250. |
| `manifest-nasa.json`, `manifest-ocw.json` | The 500 files the run collected, with their source URLs. |
| `analyze.js` | Drops duplicates (same caption text, or the same NASA title at 720p/1080p/4K) and files with fewer than 5 captions, then measures each video. |
| `results.json` | Summary per source: medians across videos, and counts of videos past each limit. |
| `videos.csv` | One row per video. |

Run it again:

```
python3 study/collect.py      # writes study/nasa/ and study/ocw/ (caption files are not in this repo)
node study/analyze.js
```

The libraries change over time, so a new run collects a different sample. The caption files belong to NASA and to MIT OpenCourseWare (CC BY-NC-SA 4.0) and are not redistributed here. The measurements in `results.json` and `videos.csv` are CC BY 4.0: please link to the study page when you use them. Neither NASA nor MIT reviewed or endorsed this study.
