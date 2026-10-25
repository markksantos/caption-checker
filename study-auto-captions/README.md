# YouTube auto-caption accuracy study (2026-10-25)

The code and per-video results behind [markstudios.com/research/youtube-auto-caption-accuracy-study](https://www.markstudios.com/research/youtube-auto-caption-accuracy-study): YouTube's automatic English captions compared word by word with each video's own human caption track, on the latest eligible uploads of MIT OpenCourseWare, NASA, TED, Khan Academy, CrashCourse and Stanford.

| File | What it is |
|---|---|
| `collect.py` | Lists each channel's latest uploads (newest first, up to 200 scanned) and keeps videos 2+ minutes long that carry both a human English track and YouTube's original automatic track (`en-orig`), up to 50 per channel. Downloads both as json3 with yt-dlp. |
| `captext.py` | Text extraction and normalization: strips sound tags, speaker labels, chevrons, music notes and styling tags; straightens apostrophes; OpenAI Whisper's English normalizer; unifies ok/okay and cuz/because. |
| `analyze.py` | Aligns the tracks with jiwer and writes `results.csv`: substitutions, deletions, insertions, words missed or wrong ((S+D)/N), normalized WER, naive WER (lowercase + punctuation only), and misses on capitalized mid-sentence terms vs other words. |
| `derived.py` | Flags a human track made by editing the automatic one: its caption start times match the automatic track's (one NASA video, 97% vs a median under 1%, was dropped; see `excluded.json`). |
| `audit_sample.py` | Seeded random sample of disagreements per channel (40 substitution/deletion spans, 20 insertion spans) with context from both tracks, for hand classification. |
| `audit/items.jsonl` | The 360 sampled items as drawn on 2026-10-25, each with six words of context from both tracks. |
| `audit/labels.json` | Our classification of every sampled item: E real recognition error, V same words written differently, H human captions departed from the speech, R human captions wrong and automatic right, U can't tell. |
| `audit_summary.py` | Shares of each class, overall and per channel. |
| `examples.py` | Checks every example quoted on the study page against the raw tracks and counts the repeated ones ("Stamford", "Khanmigo"). |
| `coverage.py` | Caption coverage of the most-subscribed channels: the channels in Wikipedia's list (`coverage-channels.json`, revision id recorded), latest 5 regular uploads each, which caption tracks the channel uploaded and whether YouTube made automatic ones. |
| `coverage_analyze.py` | Channel-level summary: own captions on all, some or none of the 5 latest videos. |
| `coverage.jsonl` | One row per checked video (485): uploaded track languages and automatic tracks. |
| `results.csv` | One row per video (299). Videos whose human track is mostly in capital letters (5) have no names comparison. |

Run it again:

```
pip install yt-dlp jiwer whisper-normalizer
python3 collect.py 50 200      # writes subs/ (caption text is not in this repo) and videos.jsonl
python3 analyze.py
python3 audit_sample.py 40 20 @mitocw   # one channel at a time; repeat per channel
python3 audit_summary.py audit/summary.json
python3 coverage.py 5 && python3 coverage_analyze.py coverage-summary.json
```

Channels keep uploading, so a new run collects a different sample. The captions belong to the channels that published them and are not redistributed here, apart from the short context snippets in `audit/items.jsonl`. Our measurements in `results.csv` and the audit labels are CC BY 4.0: please link to the study page when you use them. None of the six channels reviewed or endorsed this study.
