# Visualize Transcript

Schema-first TypeScript MVP infrastructure for turning a written transcript into a structured story graph that can later power a dashboard, mind map, or argument map UI.

The first milestone here is deliberately narrow:

- take a written transcript
- extract a thesis, sections, claims, evidence, examples, counterpoints, and conclusion
- validate that output against a strict schema
- make the result easy to render in a frontend later

This version uses Together AI as the LLM provider so the project stays lightweight and affordable for a personal build.

## MVP focus

The current codebase is intentionally centered on the first two product steps:

1. Define a stable output schema.
2. Ask an LLM to produce only that shape.
3. Validate the response before any UI touches it.
4. Let a user paste transcript text into a tiny web app and inspect the returned graph.

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
      extract-transcript-map.ts  # Together API call + parsing + validation
    utils/
      json.ts                    # Defensive JSON parsing helper
  server/
    index.ts                     # Tiny HTTP server for the paste-to-graph flow
  web/
    page.ts                      # Inline page HTML, CSS, and browser behavior
```

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

## Why Together AI

Together is a practical fit for this personal-project phase because it gives you:

- access to strong open-weight chat models
- a TypeScript SDK
- JSON schema constrained responses
- a lower-friction cost profile than starting with a more enterprise-heavy stack

This scaffold defaults to:

`meta-llama/Llama-3.3-70B-Instruct-Turbo`

That is a reasonable starting point because Together currently recommends it as a general serverless chat model, and Together's JSON mode docs support schema-constrained chat completions.

You can swap models later through `TOGETHER_MODEL`.

## Setup

1. Install dependencies

```bash
npm install
```

2. Create your environment file

```bash
cp .env.example .env
```

3. Add your Together API key to `.env`

```bash
TOGETHER_API_KEY=your_key_here
TOGETHER_MODEL=meta-llama/Llama-3.3-70B-Instruct-Turbo
```

## Run the extractor

Point the CLI at a plain text transcript file:

```bash
npm run extract -- ./transcript.txt "My Video Essay"
```

The script prints a validated `TranscriptMap` JSON object to stdout.

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

## Sources used for the Together integration

- [Together JSON mode docs](https://docs.together.ai/docs/json-mode)
- [Together chat overview](https://docs.together.ai/docs/chat-overview)
- [Together quickstart](https://docs.together.ai/docs/quickstart)
- [Together serverless model recommendations](https://docs.together.ai/docs/inference-models)
