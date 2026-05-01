import {
  transcriptMapEdgeRelationships,
  transcriptMapJsonSchema,
  transcriptMapNodeTypes
} from "../schema/transcript-map.js";

type BuildPromptOptions = {
  transcript: string;
  title?: string;
};

export function buildTranscriptMapSystemPrompt(): string {
  return [
    "You convert long-form transcripts into structured story graphs.",
    "Return only valid JSON.",
    "Prefer fewer, higher-confidence nodes over exhaustive coverage.",
    `Allowed node types: ${transcriptMapNodeTypes.join(", ")}.`,
    `Allowed edge relationships: ${transcriptMapEdgeRelationships.join(", ")}.`,
    "Create between 3 and 8 sections.",
    "Every node must include a short label, a summary, and a transcriptSpan.excerpt copied from the transcript.",
    "Use thesis for the central argument or narrative spine, even when it is implied rather than explicitly stated.",
    "Use evidence for supporting facts or sourced support, example for illustrative cases or anecdotes, counterpoint for meaningful tension or alternative framing, and conclusion for the ending synthesis or payoff.",
    "Only include edges that are genuinely useful for understanding the structure.",
    "The transcriptSpan.startChar and endChar fields are optional. Include them only if you are confident.",
    "The output must follow this JSON schema exactly:",
    JSON.stringify(transcriptMapJsonSchema)
  ].join("\n");
}

export function buildTranscriptMapUserPrompt({
  transcript,
  title
}: BuildPromptOptions): string {
  const normalizedTitle = title?.trim();

  return [
    normalizedTitle ? `Transcript title: ${normalizedTitle}` : "Transcript title: Untitled transcript",
    "",
    "Task:",
    "1. Identify the transcript's main thesis or narrative spine.",
    "2. Break the transcript into coherent sections in the order they appear.",
    "3. Extract the most important claims, evidence, examples, counterpoints, and conclusion beats.",
    "4. Represent the result as a structured graph that can be rendered in a dashboard or mind map.",
    "",
    "Transcript:",
    transcript
  ].join("\n");
}
