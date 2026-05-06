# Visualize Transcript

Schema-first TypeScript MVP infrastructure for turning a written transcript into a structured story graph that can later power a dashboard, mind map, or argument map UI.

The first milestone here is deliberately narrow:

- take a written transcript
- extract a thesis, sections, claims, evidence, examples, counterpoints, and conclusion
- validate that output against a strict schema
- make the result easy to render in a frontend later

This version uses OpenAI as the LLM provider, with `gpt-5-mini` as the default model for transcript extraction.

## MVP focus

The current codebase is intentionally centered on the first product loop:

1. Define a stable output schema.
2. Ask an LLM to produce only that shape.
3. Validate the response before any UI touches it.
4. Let a user paste transcript text into a tiny web app and inspect the returned graph.
5. Render that validated output as a first-pass mind map.

That gives you a clean contract for the next steps:

- node detail panel with transcript grounding
- basic user editing
- save/load projects
- richer graph rendering with React Flow or Cytoscape

## What is in this scaffold

```text
src/
  cli.ts                         # Run extraction against a local transcript file
  index.ts                       # Public exports
  core/
    config.ts                    # Shared constants
    prompts/
      transcript-map.ts          # System and user prompts
    schema/
      transcript-map.ts          # Zod schema, types, JSON schema, invariants
    services/
      analyze-transcript.ts      # Explicit AI analysis pipeline with diagnostics
      extract-transcript-map.ts  # OpenAI call + parsing + validation
    utils/
      json.ts                    # Defensive JSON parsing helper
  server/
    index.ts                     # Tiny HTTP server for the paste-to-graph flow
  web/
    client.tsx                   # React app with React Flow + D3 layout
    page.ts                      # HTML shell and app styling
scripts/
  build-web.mjs                  # Bundles the browser app with esbuild
```

`src/core/schema/transcript-map.ts` is the only authoritative schema definition. Anything under `dist/` is generated build output and should not be treated as a second source of truth.

## Output shape

The core object is a `TranscriptMap`.

It is designed as a hybrid of:

- a sectioned outline
- an argument/story graph

Each output includes:

- `title`
- `summary`
- `thesisNodeId`
- `sections`
- `nodes`
- `edges`
- `source`

### Node types

The allowed node types are:

- `thesis`
- `claim`
- `evidence`
- `example`
- `counterpoint`
- `conclusion`

### Edge relationships

The allowed edge relationships are:

- `contains`
- `supports`
- `explains`
- `contrasts`
- `leads_to`
- `concludes`

### Grounding

Every node must include a transcript excerpt:

```ts
transcriptSpan: {
  excerpt: string;
  startChar?: number;
  endChar?: number;
}
```

This is important because the product should stay inspectable. The visualization should never feel like unsupported magic.

## Why OpenAI

OpenAI is a strong fit for this schema-first pipeline because it gives you:

- native structured outputs with JSON schema
- a reliable text-generation API for productionizing the extractor
- a fast, lower-cost model tier in `gpt-5-mini`

This scaffold now defaults to:

`gpt-5-mini`

You can swap models later through `OPENAI_MODEL`.

## Using a real OpenAI account

This repo does not log into a ChatGPT browser session.

It uses the OpenAI API directly from the server in `src/core/services/analyze-transcript.ts`, which sends a `POST` request to `https://api.openai.com/v1/responses` with `Authorization: Bearer ${OPENAI_API_KEY}`.

To make that work with a real account:

1. Sign into the API platform at `platform.openai.com`.
2. Create an API key.
3. Add billing to your API platform account if needed.
4. Copy `.env.example` to `.env`.
5. Set `OPENAI_API_KEY` and optionally `OPENAI_MODEL`.

Important: ChatGPT subscriptions and API billing are managed separately. Having ChatGPT Plus or Pro does not automatically authenticate or fund API usage for this repo.

## Setup

1. Install dependencies

```bash
npm install
```

2. Create your environment file

```bash
cp .env.example .env
```

3. Add your OpenAI API key to `.env`

```bash
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-5-mini
```

## Run the extractor

Point the CLI at a plain text transcript file:

```bash
npm run extract -- ./transcript.txt "My Video Essay"
```

The script prints a validated `TranscriptMap` JSON object to stdout.

## AI analysis pipeline

The core now exposes two levels of API:

- `extractTranscriptMap(...)` for the smallest "give me the final graph" flow
- `analyzeTranscript(...)` for the full AI pipeline with stage timings and request diagnostics

The pipeline stages are:

1. `normalize_input`
2. `build_prompt`
3. `call_model`
4. `parse_response`
5. `validate_map`
6. `finalize_result`

That richer API is useful when you want to learn how the LLM flow works, debug failures, instrument latency, or later show step-by-step progress in the UI.

```ts
import { analyzeTranscript } from "./src/index.js";

const analysis = await analyzeTranscript({
  transcript: "Your transcript text here"
});

console.log(analysis.map);
console.log(analysis.diagnostics.stages);
```

## Development notes

### What the validator enforces

The schema layer does more than check field types. It also enforces a few graph invariants:

- exactly one thesis node must exist
- `thesisNodeId` must point to that thesis node
- every node must belong to a real section
- every section's `nodeIds` must point to nodes that actually belong to that section
- every edge must reference existing nodes
- transcript spans cannot have `startChar > endChar`

That matters because the frontend will be much easier to build once the graph contract is trustworthy.

### Prompting philosophy

The prompt intentionally biases toward:

- fewer, higher-confidence nodes
- section-level structure first
- grounded excerpts on every node
- only meaningful edges

For an MVP, this is usually better than over-extracting every possible idea.

## Recommended next build order

Now that the schema layer and smallest browser flow exist, I would build the rest in this order:

1. Richer graph renderer with React Flow
2. Node side panel showing summary plus excerpt
3. Manual node editing
4. Save/load projects
5. Better long-transcript handling with chunking and merge logic

## Known limitations in this first scaffold

- It assumes a written transcript already exists.
- It does not yet chunk very long transcripts.
- The browser graph is intentionally minimal and custom-built, not yet a full editor-grade graph UI.
- It does not yet persist projects.
- Character offsets are optional because many models are weak at precise span indexing in a single pass.

## Useful scripts

```bash
npm run dev
npm run serve
npm run typecheck
npm run build
npm run extract -- ./transcript.txt
```

## Browser flow

The current repo now includes the smallest possible browser loop for step 2:

1. start the local server
2. paste transcript text into the textarea
3. submit to `POST /api/transcript-map`
4. inspect the returned graph layout and raw JSON

Run it with:

```bash
npm run serve
```

Then open:

```text
http://127.0.0.1:3000
```

## Sources used for the OpenAI integration

- [OpenAI GPT-5 mini model docs](https://platform.openai.com/docs/models/gpt-5-mini)
- [OpenAI Responses API reference](https://platform.openai.com/docs/api-reference/responses/object)
- [OpenAI structured outputs guide](https://platform.openai.com/docs/guides/structured-outputs)
