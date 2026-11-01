# Roadmap

Where the app is going, in dependency order. Today it is a single-user CRUD API for todos, labels and priorities, with no accounts: anything that can reach the URL owns all the data.

Phases are ordered because they depend on each other, not by preference. Auth comes first because nothing else can be scoped to a person without it, email verification and password reset follow because accounts are not usable without them, and ownership scoping comes next because it changes every query in the app.

Each phase follows the workflow in `CLAUDE.md`: failing tests first, then the implementation, with the generated migration committed alongside the code.

## Decisions

| Topic | Decision |
| --- | --- |
| Authentication | Password + server-side session in a cookie, so sessions can be revoked |
| Password hashing | argon2id, with a startup smoke test because it is a native module |
| Email | A free-tier provider over SMTP behind an `IEmailSender` interface; the console in development and tests |
| Duplicate signup | One generic message for a taken email or username |
| Input handling | Controllers validate shape and size (limits in `src/input.ts`); services normalize to Unicode NFC and trim; text is stored as sent and escaped where it is used |
| History view | Completed todos leave the active list; `completed_at` records when, and survives reopening |
| Auditing | A separate `todo_events` trail, kept apart from the history view |
| Date handling | The API stores and returns UTC; the client formats using the user's settings |
| Frontend | A web UI comes later; the API is built so it can serve one |

---

## Phase 1 — Users and session auth

Accounts, so there is someone to own data.

**Schema**

- [x] `users`: `id`, `email`, `username`, `first_name`, `last_name`, `password_hash`, `created_at`, `updated_at`.
- [x] `sessions`: `id`, `user_id` (cascade delete), `created_at`, `expires_at`. The `id` is a SHA-256 hash of the cookie token, so a leaked database cannot be used to sign in.
- [x] `email` and `username` are unique case-insensitively, using the same `uniqueIndex(...).on(sql\`lower(...)\`)` pattern as label names in `src/db/schema.ts`.

**Endpoints**

- [x] `POST /auth/signup` — creates the account but does not sign in; the client logs in next. This leaves room for phase 2 to require email verification first.
- [x] `POST /auth/login`
- [x] `POST /auth/logout`
- [x] `GET /me` — the signed-in user. `/me` rather than `/users/:id` because the client does not know its own id before it has asked, and an id in the URL invites probing other people's. A `GET /users/:id` only becomes meaningful if users can ever look each other up.

**Work**

- [x] `src/users/`: model, DTO, repository (interface and implementation in one file) and service with `signup` and `get`.
- [x] `src/users/` controller: the signup and `GET /me` routes.
- [x] `src/auth/` session repository, auth service (`login`, `authenticate`, `logout`, 30-day sessions) and its controller.
- [x] Hash passwords with argon2id, using a Rust-backed package that ships prebuilt binaries so no C++ toolchain is needed at install time. `password_hash` never leaves the service: it returns a `TPublicUser`.
- [x] A test that hashes and verifies one password, so a binary that cannot load fails in CI rather than at a user's first signup. This is the lesson from `better-sqlite3`, which imported fine here and then hung on opening a database.
- [x] Signup request validation in the controller schema: email format and maximum length (254), username length (3 to 32) and allowed characters, first and last name maximum length (100), password between 12 and 128 characters. The upper bound matters: without it, a huge password makes argon2 burn server memory and CPU. Names are already normalized to Unicode NFC in the service.
- [ ] Build the Docker image for the architecture it will run on; a native binary built for arm64 will not load on an x64 host.
- [x] Session cookie via `@fastify/cookie`, with `HttpOnly`, `Secure` and `SameSite=Lax` set.
- [x] A `requireUser` hook that loads the session and puts the user on the request. Controllers read it with `currentUser(req)` and pass the id to services.
- [x] Add `UnauthorizedError` (401) to `src/errors.ts` and to the `statusByError` table in `src/app.ts`.
- [ ] `ForbiddenError` (403), deferred to phase 3, where it gets its first use. Until then the todo and label routes stay open, so that their tests change once, together with ownership.
- [ ] CSRF protection, which cookie auth requires, and a rate limit on login (see phase 7 for which limiter).
- [x] Login does the same work whether or not the account exists: when no user is found it still verifies the password against a fixed dummy hash, and every failure returns one generic "invalid email or password". Without this, an unknown email answers in about 1 ms and a wrong password in about 15 ms, which tells an attacker which emails are registered.
- [ ] Known gap until phase 2: a duplicate signup returns before hashing the password, so it is faster than a real signup. Phase 2 closes it by making signup answer identically.

**Risk** — when phase 3 protects the todo and label routes, every existing API test needs a signed-in user to act as. `createTestRepositories()` already returns the user and session repositories.

---

## Phase 2 — Email: verification and password reset

Sending email, and the two flows that depend on it. It also closes the account-enumeration gap left by phase 1, where a duplicate signup answers differently from (and faster than) a real one.

**Schema**

- [ ] `email_verified_at` on `users`, nullable.
- [ ] `email_tokens`: `id`, `user_id` (cascade delete), `type` (`verify` or `reset`), `token_hash`, `expires_at`, `used_at`, `created_at`. Only a SHA-256 hash of the token is stored, so a leaked database does not leak working links. Tokens are 32 random bytes, URL-safe.

**Sending**

- [ ] `IEmailSender` interface (recipient, subject, text body), with the implementation in the same file. A console implementation is the default for development and tests, so nothing is sent by accident. An SMTP implementation uses `nodemailer`, configured through `SMTP_*` environment variables in `src/config.ts`.
- [ ] The provider is a free tier (Resend or Brevo, both speak SMTP), so switching provider is configuration. Locally, Mailpit catches mail. Production sending needs a domain with SPF, DKIM and DMARC records; use port 587 or 465, since port 25 is blocked by most hosts.
- [ ] Tests assert on what would have been sent, with no network.

**Endpoints**

- [ ] Signup always responds the same way, whether or not the email already has an account. The real outcome goes to the inbox: a verification link for a new address, a "someone tried to sign up with your email" notice for an existing one.
- [ ] `POST /auth/verify-email` with a token, and a rate-limited resend.
- [ ] `POST /auth/forgot-password` always answers 202 with the same body. `POST /auth/reset-password` takes a token and a new password.
- [ ] A password reset invalidates every session of that user.
- [ ] Tokens are single use. Verification links expire after 24 hours, reset links after 1 hour.

**Open decision** — whether an unverified user may log in at all, or only after verifying. Stricter is safer; looser is friendlier.

**Risk** — these endpoints send mail, so they are an abuse target. They need rate limiting before they ship, so the basic limiter from phase 7 must land with this phase or a plugin-based one stands in until then.

---

## Phase 3 — Ownership scoping

The riskiest phase: it touches every query. Until it lands, accounts exist but data is still shared.

**Schema**

- [ ] `user_id` on `todos` and `labels`, referencing `users.id` with cascade delete.
- [ ] Change `labels_name_unique` from `lower(name)` to `(user_id, lower(name))`, so label names are unique per user instead of globally.

**Work**

- [ ] Every repository method takes the owner: `findAll(userId)`, `findById(userId, id)`, `delete(userId, id)`, `findByName(userId, name)`, `removeLabel(userId, labelId)`.
- [ ] The **controller** resolves the user — the auth hook turns the session cookie into a user, and the controller reads its id and passes it to the service as a plain `userId: string`. Services take an owner id as an argument and know nothing about requests, cookies or sessions; they must not import Fastify types.
- [ ] Another user's todo returns **404, not 403**, so the API does not reveal which ids exist.
- [ ] A cross-user isolation test suite: user A must not read, update, delete, or attach labels belonging to user B.

**Migration** — SQLite cannot add a `NOT NULL` foreign key to a table that already has rows, so the local database is reset as part of this phase and the column is `NOT NULL` from the start. There is no production data to preserve.

---

## Phase 4 — History of previously completed tasks

Completing a todo moves it out of the active list into a history you can look back on.

**Schema**

- [ ] Add `completed_at`, a nullable timestamp, alongside the existing `completed` boolean. The boolean is the current state; the timestamp records when the todo was last completed.

The two are deliberately not the same thing. Completing a todo sets `completed_at`, and **reopening it does not clear that timestamp** — a todo that was finished once stays in the history of previously completed tasks. Clearing it is a separate, explicit action.

**Endpoints**

- [ ] `GET /todos` returns only active todos (`completed = false`).
- [ ] `GET /todos/history` returns everything with a `completed_at`, newest first.
- [ ] Reopening (`PATCH { completed: false }`) returns a todo to the active list and leaves `completed_at` intact, so a reopened todo appears in both lists.
- [ ] Clearing the history mark is deliberate: `PATCH { completedAt: null }`, never a side effect of reopening.

**Work**

- [ ] `ITodoRepository.findAll()` becomes `findMany(userId, { status, limit, cursor, sort })`.
- [ ] Cursor pagination keyed on `(completed_at, id)`. History is the first list that grows without bound.

---

## Phase 5 — Per-user settings

**Schema**

- [ ] `language` (BCP 47, such as `en` or `pt-PT`), `time_zone` (IANA, such as `Europe/Lisbon`), `date_format`, `time_format` (12h or 24h). Defaults are created at signup.

**Endpoints**

- [ ] `GET /me/settings`
- [ ] `PATCH /me/settings`

**Work**

- [ ] Validate `time_zone` against `Intl.supportedValuesOf('timeZone')` and `language` against a supported list. Keep `date_format` and `time_format` as enums rather than free-form format strings.
- [ ] The API keeps storing and returning UTC, which it already does. The UI formats using these settings.
- [ ] Error messages are currently hardcoded English in `src/errors.ts` and the services, so a language setting means giving each error a stable machine-readable code such as `todo.not_found`, plus parameters, and translating at the HTTP boundary from the user's setting or `Accept-Language`. Worth doing for the API contract even without translations.

---

## Phase 6 — Audit trail

Separate from the history view. History is what the user reads; this is for auditing what happened.

**Schema**

- [ ] `todo_events`: `id`, `todo_id`, `user_id`, `type`, `payload` (JSON), `created_at`. Types: `created`, `updated`, `completed`, `reopened`, `deleted`.
- [ ] Deliberately **no** cascading foreign key on `todo_id`, so events outlive the todo they describe. Keep a snapshot in `payload`.

**Work**

- [ ] Write events in the service layer, since recording them is a business rule, never in the controller or the repository.
- [ ] An injected audit service, so `TodoService` does not grow to hold this.
- [ ] `GET /todos/:id/events`, user-scoped like everything else.

---

## Phase 7 — Infrastructure

Not features, but the difference between code that works and an app that can be run daily.

- [ ] Linter and formatter (the project has neither), with an `npm run lint` script.
- [ ] CI running typecheck, lint and tests on push and pull requests.
- [ ] `GET /health` for liveness, plus a readiness check that pings the database.
- [ ] Security headers and CORS with an explicit origin allowlist for the future UI.
- [ ] Rate limiting, as a deliberate learning exercise: write our own limiter (fixed window or token bucket, in memory) behind an `ITodoRepository`-style interface, with a config flag choosing ours or the battle-tested plugin. Default to the plugin; ours exists to understand the mechanics and to be swapped in knowingly. In-memory state is fine here because the app runs as a single instance anyway, which SQLite's single writer already requires.
- [ ] A multi-stage `Dockerfile`: non-root user, `/data` volume, `DATABASE_PATH` pointing into it, `migrations/` copied in, and a `.dockerignore` excluding `node_modules`, `dist` and `data`.
- [ ] Backups streaming the SQLite file to object storage, so losing the volume is not losing the data.
- [ ] API docs from the route schemas, which already exist, so this is nearly free.

---

## Later

Not committed to, in rough order of appeal: recurring todos, subtasks and checklists, reminders and notifications, full-text search, manual ordering, attachments, sharing and collaboration, a trash with retention, bulk operations, import and export, the web UI itself, and a move to Postgres if the app outgrows SQLite's single writer.
