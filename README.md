# caption-checker

Check SRT and WebVTT captions against a published caption standard: **Netflix English**, the **BBC subtitle guidelines** or the **DCMP Captioning Key**. It flags captions that read too fast, lines that are too long, too many lines, captions that stay on screen too short or too long, gaps under the minimum, overlaps and broken timestamps.

No dependencies. Node 18+. The same checker runs in the browser, with no install and no upload, at **[markstudios.com/tools/caption-checker](https://www.markstudios.com/tools/caption-checker)**.

![caption-check flagging a travel vlog's SRT file: 2 of 8 captions meet Netflix English limits](docs/preview.png)

```
$ caption-check examples/travel-vlog.srt
travel-vlog.srt: 2 of 8 captions meet Netflix English, adult programs
  #1  0:00.500 -> 0:03.000  Welcome back to the channel.
      ✗ Gap to the next caption is 0 frames at 24 fps (minimum 2)
  #3  0:06.600 -> 0:07.100  First,
      ✗ On screen 0.50 s (minimum 5/6 of a second)
  #4  0:07.200 -> 0:09.000  we packed water, snacks, a rain jacket and a spare battery for the cam
      ✗ Reading speed 41.1 characters a second (limit 20)
      ✗ Line 1 is 74 characters (limit 42)
  ...
```

## The limits

Each limit was read on the standard's own page on 2026-10-15.

| | Netflix (English) | BBC | DCMP Captioning Key |
|---|---|---|---|
| Reading speed | Up to 20 characters a second (adult), 17 (children’s) | 160–180 words a minute | Up to 130 / 140 / 160 words a minute (lower / middle / upper level) |
| Characters a line | 42 | 37 on broadcast (Teletext) | No character count |
| Lines a caption | 2 | 2; 3 for vertical 9:16 video | No more than 2 preferred |
| Shortest time on screen | 5/6 of a second | About 0.3 s a word (advice) | 40 frames (1 second and 10 frames) |
| Longest time on screen | 7 seconds | No number | 6 seconds |
| Gap between captions | 2 frames minimum; gaps under 0.5 s closed to 2 frames | If you leave a gap, at least 1 second (advice) | No rule |

Sources: [Netflix English (USA) Timed Text Style Guide](https://partnerhelp.netflixstudios.com/hc/en-us/articles/217350977-English-USA-Timed-Text-Style-Guide) · [Netflix General Requirements](https://partnerhelp.netflixstudios.com/hc/en-us/articles/215758617-Timed-Text-Style-Guide-General-Requirements) · [Netflix Subtitle Timing Guidelines](https://partnerhelp.netflixstudios.com/hc/en-us/articles/360051554394-Timed-Text-Style-Guide-Subtitle-Timing-Guidelines) · [BBC Subtitle Guidelines](https://www.bbc.co.uk/accessibility/forproducts/guides/subtitles/) · [DCMP Captioning Key: Text](https://dcmp.org/learn/597-captioning-key---text) · [DCMP Captioning Key: Presentation Rate](https://dcmp.org/learn/601-captioning-key---presentation-rate)

**How it counts.** Characters include letters, spaces and punctuation, but not line breaks or formatting (`<i>` tags, `{\an8}` codes, WebVTT voice spans). Reading speed is characters ÷ (out-time − in-time). Words are runs of characters that hold a letter or a digit, so speaker labels and sound tags count, as DCMP asks. Gaps run from one caption's out-time to the next caption's in-time, in frames at the frame rate you give. Anything a standard words as a recommendation is reported as advice, not as a failure.

## CLI

```
npx github:markksantos/caption-checker captions.srt
# or: git clone https://github.com/markksantos/caption-checker && node caption-checker/bin/caption-check.js captions.srt

caption-check <file.srt|file.vtt> [more files] [options]
  -s, --standard <id>   netflix | netflix-kids | bbc | dcmp-upper | dcmp-middle | dcmp-lower  (default: netflix)
  -f, --fps <rate>      frame rate for frame-gap checks (default: 24)
      --vertical        9:16 video (the BBC allows three lines)
      --json            JSON output
      --advice          also print advice-only notes
```

It exits with 1 when any caption breaks a limit, so it works as a CI check before captions ship.

## Library

```js
const { parse, check } = require('caption-checker');
const result = check(parse(fs.readFileSync('captions.vtt', 'utf8')), 'bbc', { vertical: true });
console.log(result.flagged, 'of', result.cues.length, 'captions break a limit');
for (const cue of result.cues) for (const issue of cue.issues) console.log(cue.n, issue.severity, issue.message);
```

`check()` accepts a standard id or your own standard object with the same fields as `STANDARDS` in `index.js`.

## Study

[`study/`](study) holds the code and data behind the [caption reading speed study](https://www.markstudios.com/research/caption-reading-speed-study): 339,521 captions in 387 NASA videos and MIT OpenCourseWare lectures, measured with this library.

## Version history

See [CHANGELOG.md](CHANGELOG.md) and [releases](https://github.com/markksantos/caption-checker/releases).

## Tests

```
npm test
```

## License

MIT © [Mark Studios](https://www.markstudios.com), a video editing and production studio.
