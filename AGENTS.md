# AGENTS.md

## Cursor Cloud specific instructions

### Architecture overview

Bytebot is a monorepo with 5 packages under `packages/`:

| Package | Type | Port | Description |
|---|---|---|---|
| `shared` | Library (build-time) | — | Shared types/utils; must be built before other packages |
| `bytebot-agent` | NestJS backend | 9991 | AI agent orchestrator (Anthropic/OpenAI/Gemini) |
| `bytebot-agent-cc` | NestJS backend | 9991 | Alternative agent using Claude Code SDK (replaces `bytebot-agent`) |
| `bytebot-ui` | Next.js frontend | 9992 | Web UI for task management, chat, and live VNC desktop view |
| `bytebotd` | NestJS daemon | 9990 | Runs inside the virtual desktop container (X11/VNC), not runnable locally |

### Prerequisites

- **Node.js 20** (required by `bytebot-agent` engine field). Use `nvm use 20`.
- **PostgreSQL 16** on port 5432, with database `bytebotdb` and user `postgres`/`postgres`.
- At least one AI API key (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or `GEMINI_API_KEY`) for task execution.

### Running services locally

Standard dev commands are in each package's `package.json`. The key workflow:

1. Build shared first: `cd packages/shared && npm run build`
2. Start agent: `cd packages/bytebot-agent && npm run start:dev`
3. Start UI: `cd packages/bytebot-ui && npm run dev`

### Environment files

Each service needs a `.env` file. Copy from `.env.example` and adjust:

- `packages/bytebot-agent/.env` — set `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/bytebotdb`
- `packages/bytebot-ui/.env` — set `BYTEBOT_AGENT_BASE_URL=http://localhost:9991`

### Database migrations

Run `cd packages/bytebot-agent && npx prisma migrate dev` to apply migrations and generate the Prisma client. The `bytebot-agent-cc` package shares the same database schema.

### Key gotchas

- The `shared` package must be built (`npm run build`) before starting any other package. All `start:dev` and `build` scripts do this automatically via `npm run build --prefix ../shared`.
- `bytebotd` cannot run locally — it requires X11, Xvfb, XFCE, x11vnc, and noVNC. It runs inside the Docker desktop container.
- Docker image pulls from `ghcr.io` may fail in Cloud Agent VMs due to network egress restrictions. Use locally installed PostgreSQL instead of Docker containers.
- No automated test files (`*.spec.ts`) exist in the codebase currently. Jest is configured but `npm test` exits with code 1 (no tests found).
- Lint (ESLint) produces pre-existing errors in `bytebot-agent`, `bytebotd`, and `bytebot-agent-cc` (mostly `@typescript-eslint/no-unsafe-*` rules). `bytebot-ui` lint passes with only warnings.
- The `bytebot-ui` task creation form requires a model to be selected. Without AI API keys, the model dropdown is empty and UI-based task creation is blocked. API-based task creation (`POST /tasks`) works regardless.
