# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — run the server with auto-reload (`tsx watch src/server.ts`)
- `npm run build` — compile TypeScript to `dist/`; `npm start` runs the compiled output
- `npm run typecheck` — `tsc --noEmit`
- `npm run db:generate` — after editing `src/db/schema.ts`, generate a SQL migration into `migrations/` (commit it); migrations are applied automatically at startup
- `npm test` — run Vitest once; `npm run test:watch` for watch mode; single file/test: `npx vitest run src/app.test.ts -t "<name>"`

There is no linter configured yet. Tests are colocated as `src/**/*.test.ts`, and the project is developed test-first (write the failing test, then the implementation). The server listens on `PORT` (default 3000) and stores data in the SQLite file at `DATABASE_PATH` (default `./data/todo-list.db`, git-ignored).

Configuration comes from environment variables, parsed and validated in `src/config.ts` (`loadConfig`):
- `PORT`, `DATABASE_PATH` as above.
- `TLS_KEY_PATH` + `TLS_CERT_PATH` — serve HTTPS directly; they must be set together or startup fails. Leave both unset when a reverse proxy or the host terminates TLS (the usual deployment).
- `TRUST_PROXY=true` — trust `X-Forwarded-*` headers so `req.ip` is the real client. Enable only behind a proxy you control, since otherwise clients can spoof their address.

## Architecture

A Fastify REST API for todos (`/todos`) and user-defined labels (`/labels`), plus a read-only `/priorities`. Each resource is layered as controller → service → repository.

- `src/todos/todo.controller.ts` — HTTP layer: `registerTodoRoutes(app, service)` declares routes and JSON-schema validation, and calls the service. No business logic. Updates use `PATCH` (partial), not `PUT`.
- `src/todos/todo.service.ts` — business logic (id/timestamp generation, not-found handling). Depends on the `ITodoRepository` interface, and throws `NotFoundError` (`src/errors.ts`) rather than touching HTTP.
- `src/todos/todo.repository.ts` — the `ITodoRepository` interface and its single implementation `TodoRepository` (SQLite via Drizzle), in the same file. `src/labels/` follows the same pattern. There are no in-memory repositories: tests use `createTestRepositories()` (`src/test/repositories.ts`), which builds the real repositories on a fresh in-memory SQLite database (`:memory:`) with migrations applied.
- `src/db/` — `schema.ts` (Drizzle tables; `todo_labels` join table with cascading foreign keys) and `client.ts` (`createDatabase(path)` opens libSQL/SQLite, enables foreign keys, runs migrations; `:memory:` is used in tests).
- `src/todos/todo.model.ts` — `TodoModel`; `todo.dto.ts` — request shapes `CreateTodoDTO`/`UpdateTodoDTO`. Labels follow the same pattern (`LabelModel`, `label.dto.ts`).
- `src/todos/priority.ts` — the fixed in-memory priority levels (`low`/green, `medium`/yellow, `high`/red); not a user-managed resource. Todos default to `low`.
- `src/labels/` — same controller/service/repository split for labels (unique case-insensitive name, required hex colour). Todos reference labels by `labelIds`; `TodoService` rejects unknown ids, and `LabelService.remove` detaches the label from all todos via `ITodoRepository.removeLabel`.
- `src/app.ts` — composition root: `buildApp({ todoRepository, labelRepository }, { https?, trustProxy? })` takes the repositories (and optional transport settings) as arguments (there is deliberately no default) and wires them → services → controllers and maps `NotFoundError`/`ValidationError`/`ConflictError` to 404/400/409 in the error handler. It does not listen, so tests can use `app.inject()`.
- `src/server.ts` — entry point; loads the config, opens the database, calls `buildApp()` with the Drizzle repositories, closes the DB on SIGINT/SIGTERM, and `listen()`s on `0.0.0.0`.

## Conventions

- ESM project (`"type": "module"`, `NodeNext` resolution): relative imports must use the `.js` extension, even though the sources are `.ts` (e.g. `import { buildApp } from './app.js'`).
- TypeScript is `strict`; ES2022 target.
- The SQLite driver is `@libsql/client` (not `better-sqlite3`, whose database constructor hung in this environment).
- Naming: interfaces are prefixed `I` (`ITodoRepository`), type aliases `T` (`TPriority`), entity models end in `Model` (`TodoModel`, an interface without the `I`), and request-body shapes end in `DTO` (`CreateTodoDTO`). An interface and its implementation live in the same file, and the implementation takes the plain name (`ITodoRepository` + `TodoRepository`), never one naming the database or ORM.
