# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — run the server with auto-reload (`tsx watch src/server.ts`)
- `npm run build` — compile TypeScript to `dist/`; `npm start` runs the compiled output
- `npm run typecheck` — `tsc --noEmit`

There is no test runner or linter configured yet. The server listens on `PORT` (default 3000).

## Architecture

A Fastify REST API for todos (CRUD under `/todos`), layered as controller → service → repository. Data is held in an in-memory `Map`, so state is lost on restart.

- `src/todos/todo.controller.ts` — HTTP layer: `registerTodoRoutes(app, service)` declares routes and JSON-schema validation, and calls the service. No business logic. Updates use `PATCH` (partial), not `PUT`.
- `src/todos/todo.service.ts` — business logic (id/timestamp generation, not-found handling). Depends on the `TodoRepository` interface, and throws `NotFoundError` (`src/errors.ts`) rather than touching HTTP.
- `src/todos/todo.repository.ts` — `TodoRepository` interface plus `InMemoryTodoRepository`. To add a real database, implement the interface and swap it in `app.ts`.
- `src/todos/todo.model.ts` — `Todo` and input types.
- `src/app.ts` — composition root: `buildApp()` wires repository → service → controller and maps `NotFoundError` to 404 in the error handler. It does not listen, so tests can use `app.inject()`.
- `src/server.ts` — entry point; calls `buildApp()` and `listen()` on `0.0.0.0`.

## Conventions

- ESM project (`"type": "module"`, `NodeNext` resolution): relative imports must use the `.js` extension, even though the sources are `.ts` (e.g. `import { buildApp } from './app.js'`).
- TypeScript is `strict`; ES2022 target.
