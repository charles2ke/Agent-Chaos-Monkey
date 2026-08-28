# Agent Chaos Monkey frontend

The Agent Chaos Monkey UI is built with React 19 and Vite.

## Local development

```bash
npm install
npm run dev
```

The UI expects the backend API at <http://localhost:5249>.

## Static demo build

Set `VITE_STATIC_DEMO=true` when building for GitHub Pages. In this mode, the
chaos engine, demo agent, and deterministic judge run entirely in the browser;
no backend is required.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run build` | Type-check and create a production build |
| `npm run lint` | Run Oxlint |
| `npm run test:e2e` | Run the Playwright end-to-end suite |
| `npm run test:e2e:static` | Run the static-demo Playwright suite |

See the [root README](../README.md) for the full project documentation.
