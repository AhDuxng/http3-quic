# NGIS Stream — Frontend

React 19 single-page application that plays MPEG-DASH streams with dash.js, applies network profiles through the backend and records QoS/QoE metrics in the browser. See the [main README](../README.md) for the full system and the experiment procedure.

## Stack

React 19, Vite 7, Tailwind CSS 3, dash.js 5, TypeScript (type-checked by the editor and ESLint; the build is done by Vite).

## Scripts

```bash
npm ci                                             # install dependencies
VITE_PROXY_TARGET=https://localhost npm run dev    # dev server on http://localhost:5173
npm run lint                                       # ESLint
npm run build                                      # production bundle in dist/
npm run preview                                    # serve dist/ locally
```

The development server proxies `/api` and `/video` to `VITE_PROXY_TARGET` (default `https://localhost`), so a running Docker stack is needed for media and network emulation.

## Source layout

```text
src/
├── App.jsx                       Session setup, player grid, global controls
├── main.jsx                      React entry point
├── type/video.ts                 Network scenario types
└── features/video/
    ├── components/               Player, video stage, telemetry, network, replay and console panels
    ├── constants/                Video catalog, network profiles, player constants
    ├── hooks/                    dash.js integration (useDashPlayer), metric sampling, stall tracking
    ├── type/                     Player, QoS and QoE record types
    └── utils/                    QoS/QoE calculations, Resource Timing helpers, CSV export
```

Metric definitions are documented in [docs/METRICS.md](../docs/METRICS.md).
