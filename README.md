# Visualize Transcript

Turn a written transcript into a validated story graph and inspect it in a small local web app.

This project uses OpenAI structured output to extract:

- a thesis
- sections
- claims, evidence, examples, counterpoints, and conclusions
- grounded transcript excerpts for every node

## What it does

- validates graph output against a Zod schema
- checks that node excerpts and optional character offsets match the transcript
- renders the result as a React Flow mind map
- lets you inspect transcript evidence per node
- supports basic node edits and dragging
- can save and reopen projects when `DATABASE_URL` is set

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create your env file:

```bash
cp .env.example .env
```

3. Add your API key:

```bash
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-5-mini
```

Optional:

```bash
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/visualize_transcript
DATABASE_SSL=require
BASIC_AUTH_USERNAME=admin
BASIC_AUTH_PASSWORD=change-me
```

Notes:

- `OPENAI_MODEL` defaults to `gpt-5-mini`.
- OpenAI requests time out after 90 seconds by default. Rate limits, server errors, and
  temporary network failures get at most one retry. Set `OPENAI_REQUEST_TIMEOUT_MS` and
  `OPENAI_MAX_ATTEMPTS` to change those limits; attempts are capped at three.
- The extraction endpoint returns stable error codes and a `Server-Timing` duration header.
  Server logs include outcome and duration, plus failure attempt count and upstream status when
  available, without transcript text.
- ChatGPT subscriptions do not include API billing.
- If `DATABASE_URL` is missing, extraction still works but save/load endpoints are unavailable.
- If `DATABASE_URL` is set, run `npm run db:migrate` before starting the app. Existing
  `transcript_projects` rows are preserved and receive version 1. Startup checks the migration
  state instead of changing the schema.

## Run

Start the local app:

```bash
npm run dev
```

Then open [http://127.0.0.1:3000](http://127.0.0.1:3000).

Production-style run:

```bash
npm run serve
```

CLI extraction:

```bash
npm run extract -- ./transcript.txt "My Video Essay"
```

## Useful scripts

```bash
npm run dev
npm run extract -- ./transcript.txt
npm run typecheck
npm test
npm run build
npm run db:migrate # only when DATABASE_URL is configured
npm run serve
```

## Output shape

The core output is a `TranscriptMap` with `title`, `summary`, `thesisNodeId`, `sections`,
`nodes`, `edges`, and `source`.

Node types: `thesis`, `claim`, `evidence`, `example`, `counterpoint`, `conclusion`

Edge relationships: `contains`, `supports`, `explains`, `contrasts`, `leads_to`, `concludes`

Every node includes a grounded transcript excerpt:

```ts
transcriptSpan: {
  excerpt: string;
  startChar?: number;
  endChar?: number;
}
```

`src/core/schema/transcript-map.ts` is the source of truth for the graph schema.
Character offsets refer to the trimmed transcript and use an exclusive `endChar`.
Graph IDs must be unique, and each node must appear in exactly one section.
Invalid node edits are shown before saving; deletion is blocked when it would empty a section
or leave fewer than three nodes.

Run the focused validation tests with `npm test`.

## Project persistence

Saved project updates include the version last loaded. A second tab's stale save returns 409
and keeps its local edits; it can reload the latest saved project or save those edits as a new
project. The project library loads 20 projects at a time with a stable cursor and a maximum
page size of 50. PostgreSQL integration tests use an isolated schema when `TEST_DATABASE_URL`
is set.

## Limitations

- expects a written transcript as input
- does not yet chunk very long transcripts
- extraction runs in the HTTP request; the browser can cancel an in-progress run
- editing is still intentionally lightweight
- there is no collaborative editing

## OpenAI references

- [GPT-5 mini](https://platform.openai.com/docs/models/gpt-5-mini)
- [Responses API](https://platform.openai.com/docs/api-reference/responses/object)
- [Structured outputs](https://platform.openai.com/docs/guides/structured-outputs)
