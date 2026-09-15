import { parseTranscriptMap, type TranscriptMap } from "../src/core/schema/transcript-map.js";

export const transcript = "Thesis line.\nClaim line.\nEvidence line.";

export function validMap(): TranscriptMap {
  return parseTranscriptMap({
    version: "1.0.0",
    title: "Example",
    summary: "A short example graph.",
    thesisNodeId: "thesis",
    sections: [
      { id: "first", title: "Beginning", summary: "The argument.", order: 0, nodeIds: ["thesis", "claim"] },
      { id: "second", title: "Support", summary: "The evidence.", order: 1, nodeIds: ["evidence"] }
    ],
    nodes: [
      { id: "thesis", type: "thesis", label: "Thesis", summary: "The main idea.", sectionId: "first", transcriptSpan: { excerpt: "Thesis line." } },
      { id: "claim", type: "claim", label: "Claim", summary: "The claim.", sectionId: "first", transcriptSpan: { excerpt: "Claim line." } },
      { id: "evidence", type: "evidence", label: "Evidence", summary: "The support.", sectionId: "second", transcriptSpan: { excerpt: "Evidence line." } }
    ],
    edges: [{ id: "support", source: "evidence", target: "claim", relationship: "supports" }],
    source: { transcriptLengthChars: transcript.length, language: "en" }
  });
}
