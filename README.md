# Visualize Transcript

Schema-first TypeScript MVP infrastructure for turning a written transcript into a structured story graph that can later power a dashboard, mind map, or argument map UI.

The first milestone here is deliberately narrow:

- take a written transcript
- extract a thesis, sections, claims, evidence, examples, counterpoints, and conclusion
- validate that output against a strict schema
- make the result easy to render in a frontend later

This version uses Together AI as the LLM provider so the project stays lightweight and affordable for a personal build.

## MVP focus

The current codebase is intentionally centered on step 1 of the product:

1. Define a stable output schema.
2. Ask an LLM to produce only that shape.
3. Validate the response before any UI touches it.

That gives you a clean contract for the next steps:

- transcript paste UI
- graph rendering with React Flow or Cytoscape
- node detail panel with transcript grounding
- basic user editing
- save/load projects

## What is in this scaffold

```text
src/
  cli.ts                         # Run extraction against a local transcript file
  config.ts                      # Shared constants
  index.ts                       # Public exports
  prompts/
    transcript-map.ts            # System and user prompts
  schema/
    transcript-map.ts            # Zod schema, types, JSON schema, invariants
  services/
    extract-transcript-map.ts    # Together API call + parsing + validation
  utils/
    json.ts                      # Defensive JSON parsing helper
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

Now that the schema layer exists, I would build the rest in this order:

1. Transcript paste page in a small web app
2. Server endpoint that calls `extractTranscriptMap`
3. First-pass graph renderer with React Flow
4. Node side panel showing summary plus excerpt
5. Manual node editing
6. Save/load projects
7. Better long-transcript handling with chunking and merge logic

## Known limitations in this first scaffold

- It assumes a written transcript already exists.
- It does not yet chunk very long transcripts.
- It does not yet render a graph in the browser.
- It does not yet persist projects.
- Character offsets are optional because many models are weak at precise span indexing in a single pass.

## Useful scripts

```bash
npm run typecheck
npm run build
npm run extract -- ./transcript.txt
```

## Sources used for the Together integration

- [Together JSON mode docs](https://docs.together.ai/docs/json-mode)
- [Together chat overview](https://docs.together.ai/docs/chat-overview)
- [Together quickstart](https://docs.together.ai/docs/quickstart)
- [Together serverless model recommendations](https://docs.together.ai/docs/inference-models)
