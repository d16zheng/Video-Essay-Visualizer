import assert from "node:assert/strict";
import { test } from "node:test";

import { projectSaveInputSchema } from "../src/core/schema/project.js";
import {
  transcriptMapSchema,
} from "../src/core/schema/transcript-map.js";
import { getTranscriptGroundingIssues } from "../src/core/schema/transcript-grounding.js";
import { getNodeDeletionError } from "../src/core/services/edit-transcript-map.js";
import { analyzeTranscript } from "../src/core/services/analyze-transcript.js";
import { ExtractionFailure } from "../src/core/services/extraction-failure.js";
import { transcript, validMap } from "./fixtures.js";

test("a valid graph is grounded and can be saved", () => {
  const map = validMap();
  assert.deepEqual(getTranscriptGroundingIssues(map, transcript), []);
  assert.equal(projectSaveInputSchema.safeParse({ transcript, map }).success, true);
});

test("graph validation rejects duplicate node, section, edge, and section-node IDs", () => {
  const map = validMap();
  const duplicateNode = transcriptMapSchema.safeParse({ ...map, nodes: [...map.nodes, { ...map.nodes[1], id: "thesis" }] });
  assert.equal(duplicateNode.success, false);
  assert.match(duplicateNode.error.issues.map((issue) => issue.message).join(" "), /Duplicate node ID thesis/);

  const duplicateSection = transcriptMapSchema.safeParse({ ...map, sections: [...map.sections, { ...map.sections[1], id: "first" }] });
  assert.equal(duplicateSection.success, false);
  assert.match(duplicateSection.error.issues.map((issue) => issue.message).join(" "), /Duplicate section ID first/);

  const duplicateEdge = transcriptMapSchema.safeParse({ ...map, edges: [...map.edges, map.edges[0]] });
  assert.equal(duplicateEdge.success, false);
  assert.match(duplicateEdge.error.issues.map((issue) => issue.message).join(" "), /Duplicate edge ID support/);

  const duplicateMembership = transcriptMapSchema.safeParse({
    ...map,
    sections: [{ ...map.sections[0], nodeIds: ["thesis", "claim", "claim"] }, map.sections[1]]
  });
  assert.equal(duplicateMembership.success, false);
  assert.match(duplicateMembership.error.issues.map((issue) => issue.message).join(" "), /Duplicate section node ID claim/);
});

test("graph validation rejects a node omitted from its section", () => {
  const map = validMap();
  const result = transcriptMapSchema.safeParse({
    ...map,
    sections: [{ ...map.sections[0], nodeIds: ["thesis"] }, map.sections[1]]
  });
  assert.equal(result.success, false);
  assert.match(result.error.issues.map((issue) => issue.message).join(" "), /Node claim is missing/);
});

test("excerpt grounding tolerates transcript whitespace but rejects invented text", () => {
  const map = validMap();
  const whitespaceMap = {
    ...map,
    nodes: map.nodes.map((node) => node.id === "thesis"
      ? { ...node, transcriptSpan: { excerpt: "Thesis   line." } }
      : node)
  };
  assert.deepEqual(getTranscriptGroundingIssues(whitespaceMap, transcript), []);

  const fabricatedMap = {
    ...map,
    nodes: map.nodes.map((node) => node.id === "claim"
      ? { ...node, transcriptSpan: { excerpt: "A claim never spoken." } }
      : node)
  };
  assert.match(getTranscriptGroundingIssues(fabricatedMap, transcript)[0]?.message ?? "", /not copied/);
  const save = projectSaveInputSchema.safeParse({ transcript, map: fabricatedMap });
  assert.equal(save.success, false);
  assert.match(save.error.issues[0]?.message ?? "", /not copied/);
});

test("offset grounding checks both offsets, bounds, and the excerpt", () => {
  const map = validMap();
  const withOffsets = (startChar?: number, endChar?: number) => ({
    ...map,
    nodes: map.nodes.map((node) => node.id === "thesis"
      ? { ...node, transcriptSpan: { excerpt: "Thesis line.", startChar, endChar } }
      : node)
  });
  assert.deepEqual(getTranscriptGroundingIssues(withOffsets(0, 12), transcript), []);
  assert.match(getTranscriptGroundingIssues(withOffsets(0), transcript)[0]?.message ?? "", /both character offsets/);
  assert.match(getTranscriptGroundingIssues(withOffsets(1, 13), transcript)[0]?.message ?? "", /do not match/);
  assert.match(getTranscriptGroundingIssues(withOffsets(0, transcript.length + 1), transcript)[0]?.message ?? "", /do not match/);
});

test("a saved graph cannot claim a different transcript length", () => {
  const map = { ...validMap(), source: { transcriptLengthChars: 1, language: "en" } };
  assert.match(getTranscriptGroundingIssues(map, transcript)[0]?.message ?? "", /source length/);
  assert.equal(projectSaveInputSchema.safeParse({ transcript, map }).success, false);
});

test("editing cannot delete the thesis, the final section node, or the third graph node", () => {
  const map = validMap();
  assert.match(getNodeDeletionError(map, "thesis") ?? "", /thesis/);
  assert.match(getNodeDeletionError(map, "evidence") ?? "", /three nodes/);
  assert.match(getNodeDeletionError(map, "claim") ?? "", /three nodes/);

  const expandedMap = {
    ...map,
    nodes: [...map.nodes, { ...map.nodes[1], id: "extra" }],
    sections: [{ ...map.sections[0], nodeIds: ["thesis", "claim", "extra"] }, map.sections[1]]
  };
  assert.equal(getNodeDeletionError(expandedMap, "claim"), null);
  assert.match(getNodeDeletionError(expandedMap, "evidence") ?? "", /section must keep/);
});

test("save validation catches blank edits and deletions that break graph minimums", () => {
  const map = validMap();
  const blankLabel = {
    ...map,
    nodes: map.nodes.map((node) => node.id === "claim" ? { ...node, label: "" } : node)
  };
  assert.equal(projectSaveInputSchema.safeParse({ transcript, map: blankLabel }).success, false);

  const emptySection = {
    ...map,
    nodes: map.nodes.filter((node) => node.id !== "evidence"),
    edges: [],
    sections: [map.sections[0], { ...map.sections[1], nodeIds: [] }]
  };
  assert.equal(projectSaveInputSchema.safeParse({ transcript, map: emptySection }).success, false);

  const tooFewNodes = {
    ...map,
    nodes: map.nodes.filter((node) => node.id !== "claim"),
    edges: [],
    sections: [{ ...map.sections[0], nodeIds: ["thesis"] }, map.sections[1]]
  };
  assert.equal(projectSaveInputSchema.safeParse({ transcript, map: tooFewNodes }).success, false);
});

test("the extraction pipeline rejects a fabricated model excerpt", async () => {
  const map = validMap();
  const fabricated = {
    ...map,
    nodes: map.nodes.map((node) => node.id === "evidence"
      ? { ...node, transcriptSpan: { excerpt: "Unsupported detail." } }
      : node)
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(fabricated) }] }]
  }), { status: 200 });
  try {
    await assert.rejects(
      analyzeTranscript({ transcript, apiKey: "test-key" }),
      (error: unknown) => error instanceof ExtractionFailure &&
        error.kind === "invalid_output" &&
        error.cause instanceof Error &&
        /excerpt is not copied from the transcript/.test(error.cause.message)
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
