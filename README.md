# AI Chat Assistant

A streaming chat assistant built with React, Express and MongoDB. Replies arrive token by token over
Server-Sent Events, every conversation is persisted, and a **Tone Toggle** rewrites the model's system
instruction so the same question comes back professional, casual or concise.

It talks to **Claude** or **OpenAI**, and ships with an offline mock provider so the whole app — streaming
included — runs end to end without an API key.

## Contents

- [Features](#features)
- [Architecture](#architecture)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [API reference](#api-reference)
- [How the tone toggle works](#how-the-tone-toggle-works)
- [Testing](#testing)
- [Project structure](#project-structure)

## Features

### Required

| Requirement | How it works |
| --- | --- |
| Chat interface | Scrollable thread with distinct user and assistant bubbles, Markdown rendering, code blocks and tables. Auto-scroll releases when you scroll up. |
| Streaming view | The provider's stream is relayed over SSE and revealed character by character. The pace adapts to the backlog so the text never lags behind the stream. |
| History sidebar | Every thread with its title, relative time and message count, newest first, cursor-paginated. Threads can be renamed and deleted. |
| API integration | Anthropic and OpenAI behind one provider interface, chosen by configuration. |
| Persistence | MongoDB stores each conversation with its exchanges: prompt, response, tone, status, timestamps, token usage and latency. |
| Tone toggle | Professional / Casual / Concise. The server turns the choice into a system instruction plus its own temperature and length budget. |

### Two extra features

**1. Stop and regenerate.** Stop a reply mid-stream and the partial text is kept and marked *Stopped*,
rather than thrown away. Any answer can be regenerated, optionally in a different tone — useful for
seeing the same question answered three ways.

**2. Search across all conversations.** Search every thread's title, prompts and responses. The server
builds the snippets and the highlight offsets, so the client only paints the ranges it is given.
Opening a result jumps to the matching message and flashes it.

Also included: copy to clipboard, keyboard-navigable tone toggle, auto-growing composer, dark mode,
mobile drawer layout, and crash recovery that cleans up interrupted streams on boot.

## Architecture

```
┌──────────────── client (React + Vite) ────────────────┐
│  components/  presentation only                       │
│  hooks/       useChat · useConversations · useTones    │
│  api/         fetch wrapper + incremental SSE parser   │
└───────────────────────┬───────────────────────────────┘
                        │  REST + text/event-stream
┌───────────────────────▼─── server (Express) ──────────┐
│  routes/       endpoint definitions                    │
│  middleware/   zod validation · error mapping          │
│  controllers/  HTTP and SSE plumbing                   │
│  services/     chat · tone · context · search · title  │
│  services/llm/ anthropic · openai · mock               │
│  models/       Mongoose schemas                        │
└───────────────────────┬───────────────────────────────┘
                        ▼
                     MongoDB
```

**All business logic lives on the server.** Prompt validation and trimming, thread titles,
context-window selection, tone-to-instruction mapping, search snippets and highlight offsets, status
transitions and rate limiting are server concerns. The client renders what it is told: it does not
build prompts, truncate history, derive titles or search text itself. Even the list of tones is
fetched from `/api/tones` rather than hard-coded.

A few decisions worth calling out:

- **SSE over WebSockets.** The stream is one-directional and short-lived, so SSE is the simpler fit. It
  is sent over `fetch` rather than `EventSource` because the request needs a POST body.
- **Exchanges embedded in the conversation.** A prompt and its response are read and written together,
  and a thread is bounded, so embedding avoids a join on every read. The prompt is written *before*
  generation starts, so a crash mid-reply never loses it.
- **Provider abstraction.** Each provider yields `{type:'delta'}` chunks then one `{type:'done'}` with
  the model and usage. Adding a provider means adding one file.
- **Race safety.** Appending a message is a single conditional update, so two tabs cannot start two
  streams in one thread (the second gets `409`).

## Getting started

**Requirements:** Node.js 20+ and MongoDB 6+ (or Docker).

```bash
git clone https://github.com/rbasil631/AI-Chat-Assistant.git
cd AI-Chat-Assistant

npm run install:all          # install server and client
docker compose up -d         # start MongoDB (skip if you already run one)

cp server/.env.example server/.env
```

Run the two dev servers in separate terminals:

```bash
npm run dev:server           # http://localhost:5000
npm run dev:client           # http://localhost:5173
```

Open <http://localhost:5173>. Without an API key the app uses the offline mock provider, so streaming,
tones, history and search all work; the replies are canned.

For live answers, add one key to `server/.env`:

```bash
ANTHROPIC_API_KEY=sk-ant-...     # or OPENAI_API_KEY=sk-...
```

To run the production build on a single port:

```bash
npm start                    # builds the client, serves it from the API on :5000
```

## Configuration

Everything is read in `server/src/config/env.js`; nothing else touches `process.env`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `5000` | API port |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/ai-chat-assistant` | Database |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed origins, comma-separated |
| `LLM_PROVIDER` | `auto` | `auto`, `anthropic`, `openai` or `mock` |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` | — / `claude-sonnet-5-5` | Claude credentials |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | — / `gpt-4o-mini` | OpenAI credentials |
| `LLM_MAX_TOKENS` | `1024` | Ceiling on reply length |
| `MAX_PROMPT_CHARS` | `8000` | Longest accepted prompt |
| `CONTEXT_EXCHANGES` / `CONTEXT_CHAR_BUDGET` | `12` / `24000` | History sent back to the model |
| `RATE_LIMIT_MAX` | `30` | Messages per minute per IP |

`auto` picks Anthropic if its key is present, then OpenAI, then the mock.

## API reference

Base path `/api`.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Database state, active provider and model |
| `GET` | `/tones` | Tone presets for the toggle |
| `POST` | `/chat/stream` | Send a message, stream the reply (SSE) |
| `POST` | `/conversations/:id/exchanges/:exchangeId/regenerate` | Re-run the latest reply (SSE) |
| `GET` | `/conversations?limit=&before=` | Thread summaries, newest first |
| `GET` | `/conversations/:id` | One thread with all exchanges |
| `PATCH` | `/conversations/:id` | Rename |
| `DELETE` | `/conversations/:id` | Delete |
| `GET` | `/search?q=&limit=` | Search titles, prompts and responses |

### Streaming a message

```http
POST /api/chat/stream
{ "conversationId": null, "prompt": "Explain database indexing", "tone": "concise" }
```

The response is `text/event-stream`: one `meta`, then `delta` events, then `done` or `error`.

```
event: meta
data: {"conversation":{"id":"...","title":"Explain database indexing"},"exchange":{"id":"..."},"isNewConversation":true}

event: delta
data: {"text":"An index"}

event: done
data: {"exchange":{"id":"...","response":"An index is...","status":"complete","usage":{...}}}
```

Closing the connection stops generation; whatever arrived is saved with status `stopped`.

Errors use a single shape, `{"error":{"code":"...","message":"..."}}`, with codes
`VALIDATION_ERROR` (400), `CONVERSATION_NOT_FOUND` (404), `STREAM_IN_PROGRESS` (409),
`CONVERSATION_FULL` and `NOT_LATEST_EXCHANGE` (422), and `RATE_LIMITED` (429). Provider failures are
mapped to messages that are safe to show a user — keys and internals never reach the client.

## How the tone toggle works

Tones live in one registry on the server (`services/tone.service.js`). The client sends only an id;
the mapping from id to model behaviour never leaves the backend:

| Tone | System instruction | Temperature | Max tokens |
| --- | --- | --- | --- |
| Professional | Formal register, structured, precise terminology | 0.4 | 1024 |
| Casual | Relaxed and conversational, contractions and light humour | 0.9 | 1024 |
| Concise | Direct answer first, three sentences or bullets at most | 0.2 | 300 |

The instruction is appended to the base system prompt and sent with the request, so the change applies
to the very next reply. The tone is stored per exchange, which is why reopening a thread restores the
tone it was last using, and why one conversation can hold answers in three different styles.

## Testing

```bash
npm test                     # 45 server tests + 5 client tests
```

Server tests run against a real MongoDB (set `MONGODB_URI_TEST` to point elsewhere). They cover the
tone registry, context trimming, title derivation and search snippets; the Anthropic and OpenAI
adapters against fake SDK clients; and the HTTP layer end to end — SSE event order, persistence,
tone switching mid-thread, stop-and-save, regenerate rules, concurrent-stream rejection, pagination,
search and every validation path.

There is also a browser test driving the real UI in headless Chromium:

```bash
pip install playwright && playwright install chromium
npm run build
NODE_ENV=production PORT=5055 MOCK_DELAY_MS=25 npm --prefix server start &
python e2e/browser_e2e.py
```

Its 21 checks cover character-by-character streaming, tone switching, regenerate, stop, persistence
across a reload, search, rename and delete, server validation surfacing in the UI, the mobile drawer
and dark mode. Screenshots land in `e2e/screenshots/`.

## Project structure

```
server/
  src/
    config/        environment, read once
    db/            connection lifecycle
    models/        Conversation schema with embedded exchanges
    services/      chat orchestration, tone, context, search, titles
      llm/         anthropic · openai · mock, one interface
    controllers/   HTTP and SSE plumbing
    routes/        endpoints and rate limiting
    middleware/    zod validation, error mapping
    validators/    request schemas
  tests/           unit + integration
client/
  src/
    api/           fetch wrapper, incremental SSE parser
    hooks/         chat, conversations, search, tones, typewriter
    components/    sidebar, message list, composer, tone toggle
    styles/        tokens and layout
  tests/           parser and component tests
e2e/               Playwright browser test
```
