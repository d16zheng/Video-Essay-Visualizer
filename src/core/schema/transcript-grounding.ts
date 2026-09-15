import { type TranscriptMap } from "./transcript-map.js";

export type TranscriptGroundingIssue = {
  nodeIndex?: number;
  message: string;
};

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

// Character offsets refer to the trimmed transcript and use an exclusive end.
export function getTranscriptGroundingIssues(
  map: TranscriptMap,
  transcript: string
): TranscriptGroundingIssue[] {
  const source = transcript.trim();
  const normalizedSource = normalizeWhitespace(source);
  const issues: TranscriptGroundingIssue[] = [];

  if (map.source.transcriptLengthChars !== source.length) {
    issues.push({
      message: "Map source length does not match the saved transcript."
    });
  }

  for (const [nodeIndex, node] of map.nodes.entries()) {
    const { excerpt, startChar, endChar } = node.transcriptSpan;
    const normalizedExcerpt = normalizeWhitespace(excerpt);

    if (!normalizedExcerpt || !normalizedSource.includes(normalizedExcerpt)) {
      issues.push({
        nodeIndex,
        message: `Node ${node.id} excerpt is not copied from the transcript.`
      });
    }

    if ((startChar === undefined) !== (endChar === undefined)) {
      issues.push({
        nodeIndex,
        message: `Node ${node.id} must provide both character offsets or neither.`
      });
    } else if (startChar !== undefined && endChar !== undefined) {
      if (
        startChar >= endChar ||
        endChar > source.length ||
        normalizeWhitespace(source.slice(startChar, endChar)) !== normalizedExcerpt
      ) {
        issues.push({
          nodeIndex,
          message: `Node ${node.id} character offsets do not match its excerpt.`
        });
      }
    }
  }

  return issues;
}

export function assertTranscriptMapGrounded(map: TranscriptMap, transcript: string): void {
  const issue = getTranscriptGroundingIssues(map, transcript)[0];
  if (issue) {
    throw new Error(issue.message);
  }
}
