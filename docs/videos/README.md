# Video walkthrough

- `walkthrough.mp4` — narrated tour of the main screens (Run, resilience
  report, Activity, Overview, Settings), capped at two minutes, with a slowly
  paced female voiceover.

Recorded from the static demo build by
`cd frontend && npm run record:walkthrough`
([`frontend/scripts/record-walkthrough.mjs`](../../frontend/scripts/record-walkthrough.mjs)),
which drives the UI with Playwright, synthesises the voiceover with
`espeak-ng` and muxes both with `ffmpeg`. The default voice is British English
female (`en-gb+f3`), with pitch `60` for a lighter, higher-pitched delivery at
130 words per minute (down from 165). Short sentences, a 1.5-second opening
pause, and at least 1.2 seconds between screens give the narration more room
to breathe. This is an offline synthetic female voice, not a recorded human
or neural voice; it still has the characteristic eSpeak sound.

Each line starts after its screen is ready. The audio includes the measured
navigation pauses so that speech does not drift ahead of the visuals.

Override `WALKTHROUGH_VOICE`, `WALKTHROUGH_PITCH` (0–99) or `WALKTHROUGH_WPM`
when recording to adjust the delivery. Edit the narration steps in the script
and re-run it after any UI change. The recording uses the simulated static demo;
testing a real agent requires the local backend.
