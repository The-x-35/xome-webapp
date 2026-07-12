# Xome

**An AI agent that actually does things.** Xome runs in your browser, connects to your real apps, works on your files, and can act on-chain with a wallet only you control. Every write asks for your approval first.

Live at **[app.xome.bot](https://app.xome.bot)** · Docs at **[xome.bot/docs](https://xome.bot/docs)**

## What it does

- **Your model, your choice.** Run a WebGPU model fully on-device (private, free, offline-capable), or bring your own Claude, GPT, or Gemini key. Keys stay in your browser and ride out per request through a stateless proxy, never stored server-side.
- **Real integrations.** Gmail, Google Calendar, Slack, Notion, GitHub, plus local folders you pick and any MCP server.
- **Acts with approval.** Reads run freely. Every write (send, post, file write, transaction) shows a consent sheet with the exact tool and arguments.
- **Crypto-native.** A non-custodial Solana wallet built in: balances, sends, swaps via Jupiter, .sol names. Signed client-side; money-moving tools can never be auto-approved.
- **An agent, not a chatbot.** Live plan checklists, background runs that survive navigation, downloadable artifacts, skills you author in Markdown, workspaces per project, and honest in-tab automations.
- **Nothing stored on our servers.** Conversations, memory, keys, tokens, skills, and the wallet live in your browser's storage. The only server code is a set of stateless proxies.

## Quick start (use it)

Open [app.xome.bot](https://app.xome.bot) in Chrome or Edge, pick a brain (cloud key or on-device model), connect your apps, and give it a task. Full guide: [Quick start](https://xome.bot/docs/quick-start).

## Quick start (run it yourself)

```bash
git clone https://github.com/xome-bot/Xome-WebApp
cd Xome-WebApp
npm install
npm run dev        # http://localhost:3000
```

Works immediately with zero configuration: on-device models, cloud models with a pasted key, Notion, MCP servers, the Solana wallet features, skills, local folder access, and all keyless web tools.

OAuth integrations (Google, Slack, GitHub) and your own Solana infra need environment variables:

```bash
cp .env.example .env.local   # every variable documented inline
```

Setup guides:

- [Run it locally](https://xome.bot/docs/self-host)
- [Environment variables](https://xome.bot/docs/env) (including the `*_PROD` dev/prod convention)
- [OAuth setup](https://xome.bot/docs/oauth-setup) for Google, Slack, and GitHub
- [Solana setup](https://xome.bot/docs/solana-setup) for Privy wallets and RPC
- [Deploying](https://xome.bot/docs/deploy) to Vercel or any Node host

## Documentation

| Section | Pages |
| --- | --- |
| Getting started | [Introduction](https://xome.bot/docs) · [Quick start](https://xome.bot/docs/quick-start) |
| Using Xome | [Models](https://xome.bot/docs/models) · [Connections](https://xome.bot/docs/connections) · [MCP servers](https://xome.bot/docs/mcp) · [Solana wallet](https://xome.bot/docs/wallet) · [Skills](https://xome.bot/docs/skills) · [Chat & agent features](https://xome.bot/docs/chat) · [Automations](https://xome.bot/docs/automations) |
| Self-hosting | [Run it locally](https://xome.bot/docs/self-host) · [Environment variables](https://xome.bot/docs/env) · [OAuth setup](https://xome.bot/docs/oauth-setup) · [Solana setup](https://xome.bot/docs/solana-setup) · [Deploying](https://xome.bot/docs/deploy) |
| Developers | [Architecture](https://xome.bot/docs/architecture) · [Adding tools](https://xome.bot/docs/add-tools) |

## Architecture in one minute

```
app/
  (app)/          tasks (chat) · history · connections · settings · skills
  onboarding/     pick a brain: cloud key or on-device model
  api/
    llm/*         streaming proxies (forward the user's key, pipe SSE)
    proxy/        allowlisted integration relay (attaches token, stores nothing)
    oauth/        start · callback · refresh (origin-aware credentials)
    solana/rpc/   server RPC relay (same-origin only)
lib/
  agent/          orchestrator · run manager · providers · tools · system prompt
  integrations/   google · slack · github · notion · solana · workspace · mcp · web
  store/          IndexedDB stores (conversations, skills, secrets, workspaces)
components/       chrome (shell) · chat · connections · settings · ui
```

The orchestrator (plan, call tools, reflect, repeat, capped at 6 iterations) never knows whether it is talking to a WebGPU model or a cloud API. Tools declare a consent level; the registry only exposes tools for integrations you enabled. Deep dive: [Architecture](https://xome.bot/docs/architecture).

**Stack:** Next.js 15 · React 19 · TypeScript (strict) · Tailwind CSS v4 · [@mlc-ai/web-llm](https://github.com/mlc-ai/web-llm) (WebGPU) · [Privy](https://privy.io) (embedded wallets) · [Jupiter](https://jup.ag) (swaps) · idb (IndexedDB)

## Extending it

- **Skills** (no code): teach workflows in Markdown, share them as links. [Skills docs](https://xome.bot/docs/skills)
- **MCP** (no code): point Xome at any MCP server. [MCP docs](https://xome.bot/docs/mcp)
- **New tools** (code): tools are plain objects with a JSON schema and an `invoke()`. [Adding tools](https://xome.bot/docs/add-tools)

## Privacy

On-device models send nothing anywhere. Cloud models and integrations receive requests directly with your credentials attached for that single call; nothing is persisted or logged server-side. Details: [privacy policy](https://xome.bot/privacy) and the in-app Privacy page.

## Related

- Marketing site + docs: [xome.bot](https://xome.bot)
- Mobile apps (iOS and Android): built, heading to the stores

Questions: contact@xome.bot
