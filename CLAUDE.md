# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — run the server with auto-reload (`tsx watch src/server.ts`)
- `npm run build` — compile TypeScript to `dist/`; `npm start` runs the compiled output
- `npm run typecheck` — `tsc --noEmit`

There is no test runner or linter configured yet. The server listens on `PORT` (default 3000).

## Architecture

A Fastify REST API for todos (CRUD under `/todos`), with data held in an in-memory `Map`, so state is lost on restart.

- `src/todos.ts` — `Todo` type and the store. All data access lives here; swapping in a real database should only require changing this file.
- `src/app.ts` — `buildApp()` creates the Fastify instance and registers the routes. It does not listen, so it can be used in tests via `app.inject()`. Request validation uses Fastify JSON schemas inline on each route. Updates use `PATCH` (partial), not `PUT`.
- `src/server.ts` — entry point; calls `buildApp()` and `listen()` on `0.0.0.0`.

## Conventions

- ESM project (`"type": "module"`, `NodeNext` resolution): relative imports must use the `.js` extension, even though the sources are `.ts` (e.g. `import { buildApp } from './app.js'`).
- TypeScript is `strict`; ES2022 target.
