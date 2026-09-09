# Video walkthrough

- `walkthrough.mp4` — narrated tour of every screen (Preview, resilience
  report, Activity, Instructions, Knowledge, Tools, Settings), capped at two
  minutes.

Recorded from the static demo build by
`cd frontend && npm run record:walkthrough`
([`frontend/scripts/record-walkthrough.mjs`](../../frontend/scripts/record-walkthrough.mjs)),
which drives the UI with Playwright, synthesises the voiceover with
`espeak-ng` and muxes both with `ffmpeg`. Edit the narration steps in that
script and re-run it after any UI change.
