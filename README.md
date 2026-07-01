# Xome for the web

A local-first AI agent that runs in the browser — the web port of the Xome mobile app, for **app.xome.bot**.

- **Runs models on-device** via WebGPU (MLC WebLLM) — private, free, offline-capable. No server in the data path.
- **Bring your own cloud model** — paste a Claude, GPT, or Gemini key; it stays in your browser and is forwarded per-request through a stateless proxy.
- **Connects to your apps** — Gmail, Calendar, Slack, Notion, GitHub, plus any **MCP** server and a set of keyless web/info tools.
- **Acts with approval** — reads run freely; every write shows a consent sheet first.
- **Local-first storage** — conversations, memory, keys, and tokens live in your browser's IndexedDB.

Design is ported 1:1 from the app (warm-neutral light/dark, indigo accent with 5 switchable accents) and the marketing site's type system (Fraunces · Geist · JetBrains Mono).

## Stack

Next.js 15 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS v4 · `@mlc-ai/web-llm` (WebGPU) · `idb` (IndexedDB).

## Architecture

```
app/
  (app)/            chat · history · connections · settings · automations · privacy  (sidebar shell)
  onboarding/       first-run local-model download / cloud-key path
  api/
    llm/{anthropic,openai,google}/   stateless streaming proxies (inject user key, pipe SSE)
    proxy/                           allowlisted integration proxy (attaches token, no storage)
    oauth/{start,callback/[p],refresh}/   server-side OAuth (PKCE, client secret, popup postMessage)
    mcp/ · web-fetch/                MCP JSON-RPC + page-text proxies (SSRF-guarded)
lib/
  agent/            orchestrator (plan→call→reflect, max 6), providers (webllm+cloud),
                    tools (registry, consent, selector, builtin, memory), system-prompt, use-chat
  integrations/     gmail · calendar · slack · notion · github (client + tools) · mcp · web · device
  store/            IndexedDB (conversations, memory, secrets, mcp, automations) + prefs (localStorage)
  models/catalog.ts curated WebLLM model list (verified ids + tool-calling support)
components/         chrome (shell/theme/icons) · chat · connections · settings · ui primitives
```

The `LlmProvider` interface is the key abstraction: the orchestrator never knows whether it's talking to a
local WebGPU model or a cloud API. Tools are gated by `integrationId` against the enabled set, and small local
models get a lexically pre-filtered tool subset (port of the app's `tool_selector`).

## Run it

```bash
npm install
npm run dev          # http://localhost:3000
```

**Works immediately, no config:** on-device models (WebGPU browser required — Chrome/Edge 113+), any cloud
provider with a pasted key, Notion (paste an internal integration token), MCP servers, and the web/info tools
(search, fetch, wikipedia, weather, currency, units, calculator) + browser tools (clipboard, location, share,
reminders).

**OAuth integrations (Gmail, Calendar, Slack, GitHub)** activate once you register OAuth apps for your domain
and set the env vars — copy `.env.example` to `.env.local` and fill in client IDs/secrets. Redirect URIs to
register:

```
{origin}/api/oauth/callback/google
{origin}/api/oauth/callback/slack
{origin}/api/oauth/callback/github
```

Until then, Connect shows a clear "not configured" message; everything else still works.

## Privacy

Local model = nothing leaves the browser. Cloud model / integration = the request goes out through a stateless
proxy with your key/token attached for that one call — never stored or logged server-side. History and memory
are browser-only; clearing them (Settings → Data, or clearing site data) wipes them. See `/privacy` in-app.

## Notes & limits

- WebGPU is required for on-device models; without it the app guides you to a cloud key.
- Automations support **Run now** today; scheduled/push triggers need an external relay (not included) — the UI
  is honest about this, mirroring the app.
- This is a faithful functional port; OAuth client registration for the production domain is the one external
  step required to light up Google/Slack/GitHub.
