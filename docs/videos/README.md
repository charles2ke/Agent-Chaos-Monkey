# Video walkthrough

- `walkthrough.mp4` — narrated tour of the main screens (Run, resilience
  report, Activity, Overview, Settings), capped at two minutes.

Recorded from the static demo build by
`cd frontend && npm run record:walkthrough`
([`frontend/scripts/record-walkthrough.mjs`](../../frontend/scripts/record-walkthrough.mjs)),
which drives the UI with Playwright, synthesises the voiceover with the
[Kokoro-82M](https://github.com/thewh1teagle/kokoro-onnx) neural text-to-speech
model (Apache-2.0) and muxes both with `ffmpeg`. The default voice is the
British English female `bf_emma` at speed `0.95`, with a 1.5 second lead-in
silence and a 1.2 second pause between steps so the tour is easy to follow.
This is a locally generated neural voice, not a recording of a human presenter.

## Requirements

- `ffmpeg` (and `ffprobe`) on PATH
- `pip install kokoro-onnx` for the neural voice; the ~350 MB model files are
  downloaded once into `frontend/.walkthrough-models/` (gitignored) and verified
  against pinned SHA-256 digests
- `espeak-ng` only if you use the fallback voice

## Options

| Variable | Default | Purpose |
| --- | --- | --- |
| `WALKTHROUGH_TTS` | `kokoro` | Set to `espeak` for the offline robotic fallback voice |
| `WALKTHROUGH_VOICE` | `bf_emma` | Kokoro voice (for example `af_heart`, `bf_isabella`), or an espeak voice such as `en-gb+f3` in fallback mode |
| `WALKTHROUGH_LANG` | `en-gb` | Kokoro pronunciation language (use `en-us` with American voices) |
| `WALKTHROUGH_SPEED` | `0.95` | Kokoro speaking rate multiplier |
| `WALKTHROUGH_PITCH` / `WALKTHROUGH_WPM` | `60` / `125` | espeak-ng fallback pitch and words per minute |
| `WALKTHROUGH_PYTHON` | `python3` | Python interpreter used for the neural voice |

Edit the narration steps in the script and re-run it after any UI change. The
recording uses the simulated static demo; testing a real agent requires the
local backend.
