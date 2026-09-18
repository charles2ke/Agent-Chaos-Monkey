# Video walkthrough

- `walkthrough.mp4` — narrated tour of the main screens (Run, resilience
  report, Activity, Overview, Settings), capped at two minutes.

Recorded from the static demo build by
`cd frontend && npm run record:walkthrough`
([`frontend/scripts/record-walkthrough.mjs`](../../frontend/scripts/record-walkthrough.mjs)),
which drives the UI with Playwright, synthesises the voiceover with
`espeak-ng` and muxes both with `ffmpeg`. The default voice is British English
female (`en-gb+f3`), with pitch `60` for a lighter, higher-pitched delivery at
125 words per minute, with a 1.5 second lead-in silence and a 1.2 second pause
between steps so the tour is easy to follow. This is an offline synthetic
approximation of a youthful British female presenter, not a recorded human or
neural voice.

Override `WALKTHROUGH_VOICE`, `WALKTHROUGH_PITCH` (0–99) or `WALKTHROUGH_WPM`
when recording to adjust the delivery. Edit the narration steps in the script
and re-run it after any UI change. The recording uses the simulated static demo;
testing a real agent requires the local backend.
