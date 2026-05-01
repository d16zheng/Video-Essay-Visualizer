import Together from "together-ai";

import {
  DEFAULT_TOGETHER_MODEL,
  TRANSCRIPT_MAP_SCHEMA_NAME,
  TRANSCRIPT_MAP_SCHEMA_VERSION
} from "../config.js";
import {
  buildTranscriptMapSystemPrompt,
  buildTranscriptMapUserPrompt
} from "../prompts/transcript-map.js";
import {
  parseTranscriptMap,
  type TranscriptMap,
  transcriptMapJsonSchema
} from "../schema/transcript-map.js";
import { parseJsonResponse } from "../utils/json.js";

export type ExtractTranscriptMapInput = {
  transcript: string;
  title?: string;
  apiKey?: string;
  model?: string;
};

type TogetherStructuredResponseFormat = {
  type: "json_schema";
  json_schema: {
    name: string;
    schema: Record<string, unknown>;
  };
};

export async function extractTranscriptMap({
  transcript,
  title,
  apiKey = process.env.TOGETHER_API_KEY,
  model = process.env.TOGETHER_MODEL ?? DEFAULT_TOGETHER_MODEL
}: ExtractTranscriptMapInput): Promise<TranscriptMap> {
  if (!apiKey) {
    throw new Error(
      "Missing Together API key. Set TOGETHER_API_KEY in your environment or pass apiKey explicitly."
    );
  }

  const normalizedTranscript = transcript.trim();

  if (!normalizedTranscript) {
    throw new Error("Transcript cannot be empty.");
  }

  const client = new Together({ apiKey });
  const responseFormat: TogetherStructuredResponseFormat = {
    type: "json_schema",
    json_schema: {
      name: TRANSCRIPT_MAP_SCHEMA_NAME,
      schema: transcriptMapJsonSchema as Record<string, unknown>
    }
  };

  const response = await client.chat.completions.create({
    model,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content: buildTranscriptMapSystemPrompt()
      },
      {
        role: "user",
        content: buildTranscriptMapUserPrompt(
          title
            ? {
                transcript: normalizedTranscript,
                title
              }
            : {
                transcript: normalizedTranscript
              }
        )
      }
    ],
    // Together's docs support response_format.json_schema, but the current SDK
    // typings still lag behind that shape, so we narrow it locally here.
    response_format: responseFormat as never
  });

  const content = response.choices[0]?.message?.content;

  if (!content) {
    throw new Error("Together returned an empty response.");
  }

  const parsed = parseJsonResponse(content);
  const map = parseTranscriptMap(parsed);

  return {
    ...map,
    version: TRANSCRIPT_MAP_SCHEMA_VERSION,
    source: {
      ...map.source,
      transcriptLengthChars: normalizedTranscript.length
    }
  };
}
