# Demo assets

- `preview-empty.png` — the Preview screen's conversation before a run.
- `resilience-report.png` — a resilience report after injecting an expired-auth
  (HTTP 401) failure.
- `navigation-menu.png` — the hamburger navigation menu, including the Overview
  sub-menus.
- `overview-tools-section.png` — a single Overview section opened from a sub-menu.
- `tab-overview.png`, `tab-activity.png`, `tab-laboratory.png`, `tab-settings.png`
  — the remaining screens, embedded in the root README's UI section.
  `tab-settings.png` is reached from the gear icon in the top right.
- `tooltips.png` — a descriptive tooltip shown on hover.
- `mobile-navigation.png` — the navigation drawer on a phone viewport.

All are copied from the Playwright screenshots in `frontend/e2e/screenshots` and
`frontend/e2e-static/screenshots`, which render at a 2x device pixel ratio so the
docs stay sharp on high definition displays. Refresh them here after any UI change
that alters these views (see the root README for how they're embedded).

Optionally add a recorded Agent Chaos Monkey UI walkthrough as `demo.gif` in
this directory for an animated overview.
