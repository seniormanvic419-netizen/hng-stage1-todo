# Ledger — To-Do with notes

A to-do list built for **HNG Internship 15, Stage 1** (AI Product Builder track) using an AI
coding agent. Tasks, notes, due dates, priorities, search and filters, dark mode, and
drag-and-drop ordering, backed by a small tested API.

## Features

- **Tasks**: add, edit the title in place, mark done, delete, clear all completed, progress bar.
- **Notes**: every task has a note field, editable in place, searchable.
- **Due dates and priority**: date picker and low/medium/high priority; overdue and due-today
  tasks are highlighted.
- **Search, filter, sort**: search titles and notes; filter by All / Active / Done / Overdue
  and by priority; sort manually, by due date, by priority or by newest.
- **Dark mode**: toggle in the header, remembered on the device, follows the system by default.
- **Drag-and-drop ordering**: drag the handle to reorder; Alt+ArrowUp/Down does the same from
  the keyboard. Order is saved to the server.
- **Works offline-ish**: changes apply instantly and are cached locally; the sync indicator
  shows when the server could not be reached.

## Stack

- Frontend: plain HTML, CSS and vanilla JavaScript in `public/`. No framework, no build step.
- API: Cloudflare Pages Functions in TypeScript under `functions/api/`.
- Storage: Cloudflare KV, one JSON document per anonymous list (identified by an
  `X-List-Id` header the browser generates once and keeps in localStorage).
- Tests: Vitest, 26 tests covering every endpoint against an in-memory KV.
- Hosting: Cloudflare Pages.

## API

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/health` | Liveness check |
| GET | `/api/tasks` | List tasks |
| POST | `/api/tasks` | Create a task |
| GET | `/api/tasks/:id` | Get one task |
| PATCH | `/api/tasks/:id` | Update title, notes, done, priority or dueDate |
| DELETE | `/api/tasks/:id` | Delete a task |
| PUT | `/api/tasks/reorder` | Set the order from `{ ids: [...] }` |

All task routes need an `X-List-Id` header (8–64 characters of letters, digits, `_` or `-`).
The full contract and validation rules are in `AGENTS.md`.

## Run locally

```sh
npm install
npm test            # endpoint tests
npm run typecheck   # TypeScript
npm run dev         # http://localhost:8788 with a local KV
```

## Deploy

```sh
npx wrangler login
npm run deploy
```

The KV namespace is bound in `wrangler.toml`; bind the same `TODO_KV` name in the Pages
project settings if deploying from a different account.

## AI usage

The whole application was written with Claude Code (Claude Fable 5.1) in a short series of
instructions: build the app with these features, write tests for every endpoint, add the
`AGENTS.md` rules, deploy and verify. `AGENTS.md` records the rules the agent follows.
