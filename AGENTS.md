# AGENTS.md

## Cursor Cloud specific instructions

### Architecture overview

Bytebot is an AI desktop agent with 4 independently-managed packages under `packages/`:

| Package | Port | Role |
|---------|------|------|
| `shared` | — | TypeScript types/utils library (build dependency for all others) |
| `bytebot-agent` | 9991 | NestJS backend — task CRUD, LLM orchestration, Prisma/PostgreSQL |
| `bytebot-ui` | 9992 | Next.js frontend — task UI + VNC viewer (custom Express server via `server.ts`) |
| `bytebotd` | 9990 | Desktop daemon (runs only inside Docker; provides computer-use API + noVNC) |

There is no root `package.json`; each package has its own `package-lock.json` — use **npm** as the package manager.

### Prerequisites

- **Node.js 20** (use `nvm use 20`)
- **PostgreSQL 16** running locally (database `bytebotdb`, user `postgres`, password `postgres`)
- **Docker** is needed only for the `bytebot-desktop` container (Docker Hub pulls may be blocked by network restrictions in Cloud Agent VMs)

### Starting services for local development

1. **Build shared** (must be done before starting agent or UI):
   ```
   cd packages/shared && npm install && npm run build
   ```

2. **Start PostgreSQL** (native install used in Cloud Agent since Docker Hub pulls are blocked):
   ```
   sudo pg_ctlcluster 16 main start
   ```

3. **Run Prisma migrations** (bytebot-agent):
   ```
   cd packages/bytebot-agent && npm run prisma:dev
   ```

4. **Start bytebot-agent** (dev mode with watch):
   ```
   cd packages/bytebot-agent && npm run start:dev
   ```

5. **Start bytebot-ui** (dev mode):
   ```
   cd packages/bytebot-ui && npm run dev
   ```

### Environment variables

Each service needs a `.env` file (see `.env.example` in each package directory). Key variables:

- `bytebot-agent`: `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/bytebotdb`
- `bytebot-ui`: `BYTEBOT_AGENT_BASE_URL=http://localhost:9991`, `BYTEBOT_DESKTOP_VNC_URL=ws://localhost:9990/websockify`, `NEXT_PUBLIC_API_URL=http://localhost:9991`
- At least one LLM API key (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or `GEMINI_API_KEY`) must be set for task execution

### Gotchas

- **shared must be built first** — the `start:dev` and `dev` scripts in agent/UI do `npm run build --prefix ../shared` automatically, but the first `npm install` in each package links against `../shared` so ensure shared's deps are installed before others.
- **Running `npm run build` while `start:dev` (watch mode) is active** will trigger a file change that crashes the NestJS watcher because the dist directory is temporarily incomplete. Avoid running the build command in bytebot-agent while the dev server is running.
- **bytebot-ui uses a custom Express server** (`server.ts` via `tsx`) that proxies WebSocket/API requests — it is NOT a vanilla `next dev` setup.
- **bytebot-desktop (bytebotd)** requires Docker and a privileged container; it cannot run natively. If Docker Hub pulls are blocked, the desktop service won't be available but agent + UI still function for task CRUD testing.
- **Lint errors in bytebot-agent** are pre-existing (152 issues, mostly `@typescript-eslint/no-unsafe-*`); they don't block builds or tests.
- **No automated tests exist** for bytebot-agent currently (the jest config finds 0 spec files).

### Lint / Test / Build commands

| Package | Lint | Test | Build |
|---------|------|------|-------|
| `shared` | `npm run lint` (needs eslint.config.js — currently missing) | — | `npm run build` |
| `bytebot-agent` | `npm run lint` | `npm test` (no tests yet) | `npm run build` |
| `bytebot-ui` | `npm run lint` | — | `npm run build` |
