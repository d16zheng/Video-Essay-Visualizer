# Server

HTTP entrypoints for:

- transcript extraction
- saved project list/load/save APIs
- optional basic-auth protection
- PostgreSQL/Supabase-backed persistence around the core transcript-mapping engine

Run `npm run db:migrate` before starting with `DATABASE_URL`. Startup verifies the applied
migrations and does not create or alter tables.

`GET /api/projects` returns `{ items, nextCursor }` under `data`. It accepts `limit` (1–50,
default 20) and an opaque `cursor`. `POST /api/projects` creates a project when `id` is absent.
Updates require `id` and `expectedVersion`; a stale version returns 409 without replacing the
stored project.
