# Demo video generator

Reproducible ~3-min demo video of the **live** Amanah site — natural neural voiceover
+ burned subtitles + on-screen interactions (nav clicks, feature-card highlights, a live
cspr.live view). No paid services: Microsoft Edge TTS (free), Playwright, ffmpeg.

## Requirements
- Python + `pip install edge-tts` · ffmpeg on PATH · Playwright (installed in `web/`)

## Run
```bash
OUT=./out
python scripts/video/narrate.py "$OUT"          # neural voiceover + subs.srt + timing.json
cd web && cp ../scripts/video/record.mjs ./tmp-record.mjs \
  && node ./tmp-record.mjs "$OUT" && rm tmp-record.mjs   # screen.webm, paced to the audio
cd "$OUT" && ffmpeg -y -i screen.webm -i narration.mp3 \
  -vf "subtitles=subs.srt:force_style='FontName=Arial,FontSize=15,BackColour=&H90000000,BorderStyle=3,Alignment=2,MarginV=28'" \
  -map 0:v:0 -map 1:a:0 -c:v libx264 -pix_fmt yuv420p -crf 22 -c:a aac -shortest amanah-demo.mp4
```

Narration text lives in `narrate.py` (`SEGMENTS`); scene actions in `record.mjs`. The two
are index-aligned — edit both together. `DEMO_BASE` overrides the target URL (defaults to
the live prod site). `amanah-demo.srt` is the caption file (upload alongside the YouTube video).
