# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — run the server with auto-reload (`tsx watch src/server.ts`)
- `npm run build` — compile TypeScript to `dist/`; `npm start` runs the compiled output
- `npm run typecheck` — `tsc --noEmit`
- `npm run db:generate` — after editing `src/db/schema.ts`, generate a SQL migration into `migrations/` (commit it); migrations are applied automatically at startup. Read every generated migration before committing: for SQLite, drizzle-kit emits `ALTER TABLE … ADD … NOT NULL REFERENCES …`, which fails on tables with rows and silently drops `ON DELETE CASCADE`. `0003` is hand-written for that reason (it rebuilds the tables). Verify foreign keys with `PRAGMA foreign_key_list(<table>)`, and that `db:generate` then reports no changes.
- `npm test` — run Vitest once; `npm run test:watch` for watch mode; single file/test: `npx vitest run src/app.test.ts -t "<name>"`

There is no linter configured yet. Tests are colocated as `src/**/*.test.ts`, and the project is developed test-first (write the failing test, then the implementation). The server listens on `PORT` (default 3000) and stores data in the SQLite file at `DATABASE_PATH` (default `./data/todo-list.db`, git-ignored).

Configuration comes from environment variables, parsed and validated in `src/config.ts` (`loadConfig`):
- `PORT`, `DATABASE_PATH` as above.
- `TLS_KEY_PATH` + `TLS_CERT_PATH` — serve HTTPS directly; they must be set together or startup fails. Leave both unset when a reverse proxy or the host terminates TLS (the usual deployment).
- `TRUST_PROXY=true` — trust `X-Forwarded-*` headers so `req.ip` is the real client. Enable only behind a proxy you control, since otherwise clients can spoof their address.
- `ALLOWED_ORIGINS` — comma-separated origins allowed past the CSRF check, for a UI on another origin.
- `RATE_LIMITER` — `plugin` (default, `@fastify/rate-limit`) or `custom` (our `SlidingWindowRateLimiter`). `src/app.rate-limit.test.ts` runs the same assertions against both, so a limit change must pass for both.

`ROADMAP.md` records the planned phases (users and session auth, ownership scoping, completed-task history, per-user settings, audit trail, infrastructure) and the decisions behind their order.

## Architecture

A Fastify REST API for todos (`/todos`), user-defined labels (`/labels`) and accounts (`/auth/*`, `/me`), plus a read-only `/priorities`. Each resource is layered as controller → service → repository.

- `src/todos/todo.controller.ts` — HTTP layer: `registerTodoRoutes(app, service)` declares routes and JSON-schema validation, and calls the service. No business logic. Updates use `PATCH` (partial), not `PUT`.
- `src/todos/todo.service.ts` — business logic (id/timestamp generation, not-found handling). Depends on the `ITodoRepository` interface, and throws `NotFoundError` (`src/errors.ts`) rather than touching HTTP.
- `src/todos/todo.repository.ts` — the `ITodoRepository` interface and its single implementation `TodoRepository` (SQLite via Drizzle), in the same file. `src/labels/` follows the same pattern. There are no in-memory repositories: tests use `createTestRepositories()` (`src/test/repositories.ts`), which builds the real repositories on a fresh in-memory SQLite database (`:memory:`) with migrations applied.
- `src/db/` — `schema.ts` (Drizzle tables; `todo_labels` join table with cascading foreign keys) and `client.ts` (`createDatabase(path)` opens libSQL/SQLite, enables foreign keys, runs migrations; `:memory:` is used in tests).
- `src/todos/todo.model.ts` — `TodoModel`; `todo.dto.ts` — request shapes `CreateTodoDTO`/`UpdateTodoDTO`. Labels follow the same pattern (`LabelModel`, `label.dto.ts`).
- `src/todos/priority.ts` — the fixed in-memory priority levels (`low`/green, `medium`/yellow, `high`/red); not a user-managed resource. Todos default to `low`.
- `src/labels/` — same controller/service/repository split for labels (unique case-insensitive name, required hex colour). Todos reference labels by `labelIds`; `TodoService` rejects unknown ids, and `LabelService.remove` detaches the label from all todos via `ITodoRepository.removeLabel`.
- `src/users/` and `src/auth/` — accounts and sessions. `UserService` handles signup and returns `TPublicUser` (never the password hash). `AuthService` logs in (argon2id via `PasswordHasher`; an unknown email is still checked against a dummy hash so both failures cost the same), and stores sessions by a SHA-256 hash of the cookie token. Sessions expire after 7 days idle (the stored `expires_at` slides forward on use, rewritten at most hourly) and 30 days after `created_at` at most; the constants are at the top of `auth.service.ts`, and tests drive time through the injectable `now`. The `requireUser` hook from `createRequireUser` resolves the `sid` cookie and sets `req.user`; controllers call `currentUser(req).id` and pass that plain id to services, which never see the request. 
- Ownership: every todo and label route requires a session (the `requireUser` hook, as `onRequest`), and every repository and service method takes the owner's `userId` first. Repositories filter by it and refuse to save over another user's row; models and responses never carry it. Another user's todo or label is a `NotFoundError` (404), never a 403. `/priorities` is the only public data route. API tests act as a user through `signUpAndLogIn`/`as` (`src/test/auth.ts`); lower-level tests use `createTestUser` (`src/test/users.ts`).
- `src/csrf.ts` — an app-wide `onRequest` hook that rejects cross-site writes with 403, using the browser-set `Sec-Fetch-Site` and `Origin` headers; requests with neither (curl) pass.
- `src/rate-limit/` — `setUpRateLimits(app, kind)` returns per-route options (`config.rateLimit` for the plugin, an `onRequest` hook for ours) that controllers spread into a route; the limits live in `RATE_LIMITS`. Routes are registered inside an `app.register` block in `app.ts` because the plugin only attaches to routes added after it has loaded.
- `src/app.ts` — composition root: `buildApp({ todoRepository, labelRepository, userRepository, sessionRepository }, { https?, trustProxy? })` takes the repositories (and optional transport settings) as arguments (there is deliberately no default) and wires them → services → controllers and maps `NotFoundError`/`ValidationError`/`UnauthorizedError`/`ForbiddenError`/`ConflictError`/`TooManyRequestsError` to 404/400/401/403/409/429 in the error handler. It does not listen, so tests can use `app.inject()`.
- `src/server.ts` — entry point; loads the config, opens the database, calls `buildApp()` with the Drizzle repositories, closes the DB on SIGINT/SIGTERM, and `listen()`s on `0.0.0.0`.

## Conventions

- ESM project (`"type": "module"`, `NodeNext` resolution): relative imports must use the `.js` extension, even though the sources are `.ts` (e.g. `import { buildApp } from './app.js'`).
- TypeScript is `strict`; ES2022 target.
- Input handling: controllers validate shape and size with JSON schemas, using the limits and patterns in `src/input.ts` (string lengths count characters, not bytes). Services canonicalize with `cleanText`/`normalizeText` (Unicode NFC, trim) so they stay correct for any caller. Text is stored exactly as sent and escaped where it is used (SQL is parameterized by Drizzle, HTML is the UI's job), never stripped on input.
- The SQLite driver is `@libsql/client` (not `better-sqlite3`, whose database constructor hung in this environment).
- Naming: interfaces are prefixed `I` (`ITodoRepository`), type aliases `T` (`TPriority`), entity models end in `Model` (`TodoModel`, an interface without the `I`), and request-body shapes end in `DTO` (`CreateTodoDTO`). An interface and its implementation live in the same file, and the implementation takes the plain name (`ITodoRepository` + `TodoRepository`), never one naming the database or ORM.
