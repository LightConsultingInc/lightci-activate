# Activate MCP App (`mcp-app/`)

The in-Claude UI for LightCI Activate: one single-file React bundle that the API serves as the MCP Apps resource `ui://activate/app.html`. Every Activate tool (`my_ladder`, `library`, `skill_detail`, `submit_skill`, `submit_artifact`, `map_workflow`, `team`, `org`, `promotion_queue`) mounts this same bundle; it routes on `structuredContent.tool` and renders the matching card.

## Build

```sh
cd mcp-app
yarn
yarn build          # tsc --noEmit && vite build  →  dist/app.html
```

`dist/app.html` is a self-contained HTML file (all JS and CSS inlined, no external URLs). The API reads it at startup from `MCP_APP_HTML` (default `../mcp-app/dist/app.html`, relative to `api/`). If the file is missing the API serves a placeholder that says to run this build.

Typecheck only: `yarn typecheck`.

## Eyeball the cards without a host

```sh
yarn dev
```

Then open:

- `http://localhost:5173/dev.html` — gallery of links
- `http://localhost:5173/?mock=my_ladder` (also `library`, `skill_detail`, `submit_skill`, `submit_artifact`, `map_workflow`, `team`, `org`, `promotion_queue`, `error`, `empty`, `all`)
- append `&theme=dark` to preview the dark theme

In mock mode the broker (`activate_api`) is answered from `src/fixtures/` so adopt / fork / approve / send-turn flows can be clicked through.

## How it talks to the server

- Initial render comes from the tool result (`app.ontoolresult` → `structuredContent`), shaped as `{ tool, data, links: { web }, viewer, input?, error? }` where `data` is the REST payload verbatim (see `docs/api-contract.md`).
- Refresh and actions go through the app-only broker tool: `app.callServerTool({ name: 'activate_api', arguments: { path, method, body } })`, wrapped by `src/lib/useActivateApi.ts` so cards call `api('/skills/:id/adopt', { method: 'POST' })`.
- Host theme is applied with `useHostStyles`; LightCI tokens (`--paper`, `--ink`, `--glow`, `--pass`, `--revise`, `--fail`) fall back when the host provides no variables. Fullscreen uses `requestDisplayMode`; "Open in Activate" uses `openLink`.

## CSP

The resource is registered with `csp: { connectDomains: [], resourceDomains: [] }`. The bundle must therefore never load anything from the network: no CDN scripts, no web fonts, no remote images. System font stack only, inline SVG for charts. `yarn build` output can be checked with `grep -c 'src="http' dist/app.html` (expect 0).

## Layout

```
src/
  main.tsx              mount
  App.tsx               host wiring (useApp), routing, mock mode, error/empty states
  cards/                one card per tool
  components/           CardShell, primitives (Pill, Meter, Ring, Sparkline, Tile, …)
  lib/                  envelope types, useActivateApi broker hook, format helpers, markdown renderer
  fixtures/             demo payloads + mock broker responder
  types.ts              payload types from docs/api-contract.md
  styles.css            Tailwind 4 + design tokens
public/dev.html         card gallery for local eyeballing
```
