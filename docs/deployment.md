# Deployment guide

The app runs as one Node service backed by PostgreSQL. Use a host that runs Node 24 and keeps
the repository root as its working directory, because migrations are read from
`db/migrations/*.sql` at startup time.

## Render release

The repository includes `render.yaml` for one Render web service that serves both the React
frontend and Node API, plus a PostgreSQL database. After signing in to Render, create a new
Blueprint from the GitHub repository and choose `main`. Render prompts for
`OPENAI_API_KEY`, `BASIC_AUTH_USERNAME`, and `BASIC_AUTH_PASSWORD` during the initial Blueprint
setup. Enter real values in that prompt; never put them in Git. The Blueprint pins Node 24 via
`.node-version`, binds all interfaces, connects to the database over Render's private network,
and checks `/health` before routing traffic to a new deploy.

The Blueprint uses Render's free web and PostgreSQL plans for an initial live verification.
The free PostgreSQL database expires after 30 days and has no backups, so upgrade the database
before storing work that must be retained. Render may spin down a free web service after idle
time; allow for a cold start on the first health request.

Once Render shows a successful deploy, set `DEPLOYED_URL` to its HTTPS `onrender.com` URL and
run the production smoke test with the same Basic Auth credentials. It makes a real OpenAI
extraction, saves and reopens a sample project, and checks a stale-save conflict:

```bash
DEPLOYED_URL=https://your-service.onrender.com \
BASIC_AUTH_USERNAME=your-username \
BASIC_AUTH_PASSWORD=your-password \
npm run smoke:deployed
```

The command prints the extraction's `X-Request-ID`. Find the matching
`transcript_extraction` JSON record in Render's service logs and confirm its `durationMs`,
`attempts`, `outcome`, and (on a failure) `failureKind`. Record the deployed URL and smoke
result in the release notes before describing the application as live.

## Service configuration

Build command:

```bash
npm ci && npm run build
```

Start command:

```bash
npm run start:release
```

`start:release` applies any pending versioned SQL migrations and starts the compiled server.
Migration runs are idempotent. Startup fails when the database schema is missing or incompatible.
Keep `dist/server`, `dist/public`, and `db/migrations` in the deployed working directory. The
start command needs production dependencies only; the build requires development dependencies.

Set these service environment variables in the host's secret/configuration UI:

| Variable | Value |
| --- | --- |
| `HOST` | `0.0.0.0` |
| `PORT` | Port assigned by the host; the server defaults to `3000` |
| `DATABASE_URL` | Managed PostgreSQL connection string |
| `DATABASE_SSL` | `require` when the database provider requires TLS |
| `OPENAI_API_KEY` | API key for real extraction |
| `OPENAI_MODEL` | Optional; defaults to `gpt-5-mini` |
| `BASIC_AUTH_USERNAME` | Username for the API |
| `BASIC_AUTH_PASSWORD` | Strong password for the API |

The health check path is `/health`. Basic Auth protects API routes, including extraction and
project persistence. The landing page and static assets remain publicly readable. Use the
host's HTTPS endpoint so credentials and transcript content are encrypted in transit.
The response `X-Request-ID` matches JSON records in the service's stdout logs. Use those records
to inspect extraction failures, model stage durations, and database operation failures without
collecting transcript text or secrets.

## Verify a release

1. Confirm `/health` returns `{"ok":true}` and the landing page loads its JavaScript asset.
2. Confirm an unauthenticated `/api/projects` request returns 401, then sign in and open the
   project library.
3. Extract a short, known transcript using the configured OpenAI key. Save it, reload the page,
   and reopen the saved project.
4. Open that project in two tabs. Save a change in one tab, then try saving a different change
   from the other tab; the second tab should show the existing 409 conflict flow.

CI performs a release smoke check against disposable PostgreSQL without an OpenAI API key. It
creates a sample project, reopens it, and checks the version conflict response.
To reproduce the full check locally, point `DATABASE_URL` at a disposable database and run:

```bash
npm ci
npm run typecheck
npm test
npm run build
npm prune --omit=dev
npm run db:migrate
npm run smoke:release
```

Only use a disposable database for the full smoke check because it writes a sample project.
Without `DATABASE_URL`, `npm run smoke:release` checks the health, assets, authentication,
extraction error path, and the expected unavailable persistence response. The GitHub Actions
PostgreSQL service and test credentials are created for each CI run and are discarded afterward.
