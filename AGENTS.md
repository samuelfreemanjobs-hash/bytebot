# Agents

## Cursor Cloud specific instructions

### Architecture overview

Bytebot is an AI Desktop Agent monorepo under `packages/`:

| Package | Port | Purpose |
|---|---|---|
| `@bytebot/shared` | — | Shared TypeScript types; must be built first (`npm run build`) |
| `bytebot-agent` | 9991 | NestJS AI agent backend (Anthropic / OpenAI / Gemini) |
| `bytebot-ui` | 9992 | Next.js frontend with Express WebSocket proxy server |
| `bytebotd` | 9990 | Desktop daemon (runs inside Docker container, not locally) |

There is no root `package.json` — each package manages its own `node_modules`.

### Required Node.js version

The codebase requires **Node.js 20** (specified in `engines` field). Use `nvm use 20` before running commands.

### Database

PostgreSQL 16 is required. In the Cloud Agent environment it is installed natively (not via Docker) at `localhost:5432` with user `postgres` / password `postgres` and database `bytebotdb`.

### Development workflow

Per `docker/docker-compose.development.yml`, the intended local dev flow is:

1. Run **postgres** and **bytebot-desktop** via Docker (or postgres natively)
2. Run **bytebot-agent** and **bytebot-ui** locally via npm

Standard dev commands (run from each package directory):

- **shared**: `npm run build` (must be done before starting agent or UI)
- **agent**: `npm run start:dev` (NestJS watch mode)
- **UI**: `npm run dev` (Next.js dev mode via custom Express server)
- **agent build**: `npm run build` (also builds shared + generates Prisma client)

### Environment variables

Copy `.env.example` to `.env` in `packages/bytebot-agent/` and `packages/bytebot-ui/`. Key values for local dev:

- `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/bytebotdb`
- `BYTEBOT_DESKTOP_BASE_URL=http://localhost:9990`
- At least one of: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`

### Prisma migrations

Run from `packages/bytebot-agent/`:
```
npx prisma migrate dev
```

### Lint & test

- **shared**: `npm run lint` (needs eslint.config.js — currently absent, so lint is a no-op)
- **agent**: `npm run lint` (pre-existing eslint warnings exist in the codebase)
- **UI**: `npm run lint` (uses `next lint`)
- **Tests**: `npm test` in agent/UI — no test files exist in the codebase currently

### Gotchas

- The `bytebot-desktop` Docker image is very large (~1.5 GB). In cloud environments with restricted Docker networking, pull may fail. Tasks will show as "failed" without the desktop container running — this is expected.
- The `bytebot-agent` will start and serve API requests even without an API key, but task execution will fail without at least one configured LLM API key.
- The UI uses a custom Express server (`server.ts`) rather than the default Next.js dev server. The `npm run dev` command runs this server via `tsx`.
- `@bytebot/shared` must be built before starting any other package — the `start:dev` and `dev` scripts do this automatically.
