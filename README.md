# Visualize Transcript

Turn a written transcript into a validated story graph and inspect it in a small local web app.

This project uses OpenAI structured output to extract:

- a thesis
- sections
- claims, evidence, examples, counterpoints, and conclusions
- grounded transcript excerpts for every node

## What it does

- validates output against a single Zod schema
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
- ChatGPT subscriptions do not include API billing.
- If `DATABASE_URL` is missing, extraction still works but save/load endpoints are unavailable.

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
npm run build
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

## Limitations

- expects a written transcript as input
- does not yet chunk very long transcripts
- editing is still intentionally lightweight
- there is no collaborative editing

## OpenAI references

- [GPT-5 mini](https://platform.openai.com/docs/models/gpt-5-mini)
- [Responses API](https://platform.openai.com/docs/api-reference/responses/object)
- [Structured outputs](https://platform.openai.com/docs/guides/structured-outputs)
