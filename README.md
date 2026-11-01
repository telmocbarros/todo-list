# Todo List API

A REST API for managing todos, built with Node.js, TypeScript, Fastify and SQLite (via Drizzle ORM).

Todos have a title, description, priority, due date and labels. You create the labels yourself. Data is stored in a local SQLite file, so it survives restarts.

> **Status:** early. You can create an account and sign in, but todos and labels are not yet tied to an account or protected by login: anyone who can reach the server can read and change them. Run it on localhost or a private network only. See [ROADMAP.md](ROADMAP.md) for what is planned.

## Quick start

Requires Node.js 22.12 or newer (22.12+, 24.x or 26+). Odd-numbered releases such as 23 and 25 are not supported by the test runner. `npm install` refuses to run on an unsupported version, because `.npmrc` sets `engine-strict=true`.

```sh
npm install
npm run dev
```

The server listens on <http://localhost:3000> and creates its database at `./data/todo-list.db` on first start.

```sh
curl -X POST localhost:3000/todos \
  -H 'content-type: application/json' \
  -d '{"title": "Write report", "priority": "high"}'
```

## Configuration

Settings come from environment variables. All are optional.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | Port to listen on |
| `DATABASE_PATH` | `./data/todo-list.db` | Location of the SQLite file. The folder is created if missing |
| `TLS_KEY_PATH`, `TLS_CERT_PATH` | unset | Serve HTTPS directly. Set both or neither |
| `TRUST_PROXY` | `false` | Set to `true` behind a reverse proxy you control, so the real client address is used |
| `ALLOWED_ORIGINS` | none | Comma-separated origins, such as `https://app.example.com`, allowed to send writes from another site |
| `RATE_LIMITER` | `plugin` | `plugin` uses `@fastify/rate-limit`; `custom` uses the project's own sliding-window limiter |

When a reverse proxy or your hosting platform handles HTTPS (the usual setup), leave the TLS variables unset and the app serves plain HTTP behind it.

To try HTTPS locally with a throwaway certificate:

```sh
openssl req -x509 -newkey rsa:2048 -nodes -days 30 -subj /CN=localhost \
  -addext subjectAltName=DNS:localhost,IP:127.0.0.1 -keyout key.pem -out cert.pem
TLS_KEY_PATH=key.pem TLS_CERT_PATH=cert.pem npm run dev
curl --cacert cert.pem https://localhost:3000/todos
```

## API

All request and response bodies are JSON. Dates are ISO 8601 strings in UTC.

### Accounts

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/auth/signup` | Create an account (`201`). Does not sign you in |
| `POST` | `/auth/login` | Sign in with `email` and `password`. Sets the session cookie |
| `POST` | `/auth/logout` | Sign out (`204`). Ends the session and clears the cookie |
| `GET` | `/me` | The signed-in user, or `401` |

Signup takes `email`, `username` (3 to 32 letters, digits, `.`, `-` or `_`), `firstName`, `lastName` (each up to 100 characters) and `password` (12 to 128 characters). Passwords are stored as argon2id hashes and never returned.

Signing in sets an `HttpOnly`, `Secure`, `SameSite=Lax` cookie named `sid`. A session ends after 7 days without use, and 30 days after signing in at the latest, however active it is. Send the cookie back on later requests:

Login is limited to 10 attempts per 15 minutes and signup to 5 per hour, per IP address. Writes that the browser marks as coming from another site are refused, so other websites cannot act with your cookie.

```sh
curl -c cookies.txt -X POST localhost:3000/auth/login \
  -H 'content-type: application/json' \
  -d '{"email": "ada@example.com", "password": "correct horse battery staple"}'
curl -b cookies.txt localhost:3000/me
```

### Todos

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/todos` | List all todos |
| `GET` | `/todos/:id` | Get one todo |
| `POST` | `/todos` | Create a todo. It always starts incomplete |
| `PATCH` | `/todos/:id` | Update any of the fields below, including `completed` |
| `DELETE` | `/todos/:id` | Delete a todo (`204`) |

| Field | Type | Notes |
| --- | --- | --- |
| `title` | string | Required on create. Up to 200 characters, one line |
| `description` | string | Up to 5,000 characters. UTF-8 and emojis are fine, line breaks allowed. Default `""` |
| `priority` | `low` \| `medium` \| `high` | Default `low` |
| `labelIds` | string[] | Ids of existing labels, up to 50. Default `[]` |
| `dueDate` | date-time \| `null` | Default `null`. Send `null` on update to clear it |
| `completed` | boolean | Update only |

```json
{
  "id": "308cbf53-b8bb-4f6c-9575-3f6f3e776ed5",
  "title": "Write report",
  "description": "Q3 numbers ☕",
  "completed": false,
  "priority": "high",
  "labelIds": ["0b751cfd-3c47-48e4-b699-2b882da51104"],
  "dueDate": "2030-01-31T17:00:00.000Z",
  "createdAt": "2026-11-01T18:48:56.405Z",
  "updatedAt": "2026-11-01T18:48:56.405Z"
}
```

### Priorities

`GET /priorities` returns the three fixed levels and their colors: `low` (green), `medium` (yellow) and `high` (red).

### Labels

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/labels` | List all labels |
| `GET` | `/labels/:id` | Get one label |
| `POST` | `/labels` | Create a label |
| `PATCH` | `/labels/:id` | Rename or recolor a label |
| `DELETE` | `/labels/:id` | Delete a label. It is also removed from every todo using it |

A label has a `name` (up to 50 characters, unique ignoring case) and a `color` as a hex code such as `#3366ff`. Both are required on create.

### Errors

| Status | When | Body |
| --- | --- | --- |
| `400` | Invalid input, or an unknown label id on a todo | Validation details |
| `401` | Wrong email or password, or a missing or expired session | `{"error": "Invalid email or password"}` |
| `403` | A write sent from another website | `{"error": "Cross-site request blocked"}` |
| `404` | Todo or label does not exist | `{"error": "Todo not found"}` |
| `409` | A label name, email or username is already taken | `{"error": "Label \"work\" already exists"}` |
| `413` | Request body larger than 64 KiB | |
| `429` | Too many login or signup attempts. The `Retry-After` header says how many seconds to wait | `{"error": "Too many requests, try again later"}` |

## Development

| Command | What it does |
| --- | --- |
| `npm run dev` | Run with auto-reload |
| `npm test` | Run the tests once (`npm run test:watch` to watch) |
| `npm run typecheck` | Type-check without building |
| `npm run build` | Compile to `dist/`; `npm start` runs the result |
| `npm run db:generate` | Generate a SQL migration after changing `src/db/schema.ts` |

Migrations in `migrations/` are applied automatically when the server starts, and must be committed. Tests use a fresh in-memory SQLite database, and the project is developed test-first.

## Deploying

The database is a single file, so it must live on storage that survives restarts. In a container, mount a persistent volume and point `DATABASE_PATH` into it, for example `/data/todo-list.db`. Run a single instance, since SQLite allows only one writer. Back the file up.

## More documentation

- [ROADMAP.md](ROADMAP.md): planned features and the decisions behind their order.
- [CLAUDE.md](CLAUDE.md): architecture and conventions, for contributors and AI assistants.
