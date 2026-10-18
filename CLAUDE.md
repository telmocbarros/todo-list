# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — run the server with auto-reload (`tsx watch src/server.ts`)
- `npm run build` — compile TypeScript to `dist/`; `npm start` runs the compiled output
- `npm run typecheck` — `tsc --noEmit`
- `npm test` — run Vitest once; `npm run test:watch` for watch mode; single file/test: `npx vitest run src/app.test.ts -t "<name>"`

There is no linter configured yet. Tests are colocated as `src/**/*.test.ts`, and the project is developed test-first (write the failing test, then the implementation). The server listens on `PORT` (default 3000).

## Architecture

A Fastify REST API for todos (`/todos`) and user-defined labels (`/labels`), plus a read-only `/priorities`. Each resource is layered as controller → service → repository. Data is held in an in-memory `Map`, so state is lost on restart.

- `src/todos/todo.controller.ts` — HTTP layer: `registerTodoRoutes(app, service)` declares routes and JSON-schema validation, and calls the service. No business logic. Updates use `PATCH` (partial), not `PUT`.
- `src/todos/todo.service.ts` — business logic (id/timestamp generation, not-found handling). Depends on the `TodoRepository` interface, and throws `NotFoundError` (`src/errors.ts`) rather than touching HTTP.
- `src/todos/todo.repository.ts` — `TodoRepository` interface plus `InMemoryTodoRepository`. To add a real database, implement the interface and swap it in `app.ts`.
- `src/todos/todo.model.ts` — `Todo` and input types.
- `src/todos/priority.ts` — the fixed in-memory priority levels (`low`/green, `medium`/yellow, `high`/red); not a user-managed resource. Todos default to `low`.
- `src/labels/` — same controller/service/repository split for labels (unique case-insensitive name, required hex colour). Todos reference labels by `labelIds`; `TodoService` rejects unknown ids, and `LabelService.remove` detaches the label from all todos via `TodoRepository.removeLabel`.
- `src/app.ts` — composition root: `buildApp()` wires repositories → services → controllers and maps `NotFoundError`/`ValidationError`/`ConflictError` to 404/400/409 in the error handler. It does not listen, so tests can use `app.inject()`.
- `src/server.ts` — entry point; calls `buildApp()` and `listen()` on `0.0.0.0`.

## Conventions

- ESM project (`"type": "module"`, `NodeNext` resolution): relative imports must use the `.js` extension, even though the sources are `.ts` (e.g. `import { buildApp } from './app.js'`).
- TypeScript is `strict`; ES2022 target.
- Naming: interfaces are prefixed `I` (`ITodoRepository`), type aliases `T` (`TPriority`), entity models end in `Model` (`TodoModel`, an interface without the `I`), and request-body shapes end in `DTO` (`CreateTodoDTO`). Implementation classes use neutral names (`PersistentTodoRepository`), never the database or ORM name.
