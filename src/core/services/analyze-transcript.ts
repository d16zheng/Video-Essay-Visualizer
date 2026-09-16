import {
  DEFAULT_OPENAI_MODEL,
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
import { assertTranscriptMapGrounded } from "../schema/transcript-grounding.js";
import { ExtractionFailure } from "./extraction-failure.js";
import { sendOpenAiRequest } from "./openai-request.js";

export const transcriptAnalysisStageNames = [
  "normalize_input",
  "build_prompt",
  "call_model",
  "parse_response",
  "validate_map",
  "finalize_result"
] as const;

export type TranscriptAnalysisStageName =
  (typeof transcriptAnalysisStageNames)[number];

export type AnalyzeTranscriptInput = {
  transcript: string;
  title?: string;
  apiKey?: string;
  model?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxAttempts?: number;
  onAttempt?: (attempt: number) => void;
  onStage?: (stage: TranscriptAnalysisStageRecord) => void | Promise<void>;
};

export type TranscriptAnalysisStageRecord = {
  name: TranscriptAnalysisStageName;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  summary: string;
};

export type TranscriptAnalysisInputProfile = {
  title: string;
  transcriptLengthChars: number;
  transcriptLengthWords: number;
  transcriptLineCount: number;
  preview: string;
};

export type TranscriptAnalysisRequest = {
  provider: "openai";
  model: string;
  responseFormat: "json_schema";
  strictSchema: boolean;
  schemaName: string;
  schemaVersion: string;
};

export type TranscriptAnalysisResponse = {
  rawContent: string;
};

export type TranscriptAnalysisDiagnostics = {
  input: TranscriptAnalysisInputProfile;
  request: TranscriptAnalysisRequest;
  stages: TranscriptAnalysisStageRecord[];
  totalDurationMs: number;
};

export type TranscriptAnalysisResult = {
  map: TranscriptMap;
  diagnostics: TranscriptAnalysisDiagnostics;
  prompts: {
    system: string;
    user: string;
  };
  response: TranscriptAnalysisResponse;
};

type OpenAiStructuredResponseFormat = {
  type: "json_schema";
  name: string;
  schema: Record<string, unknown>;
  strict: true;
};

type NormalizedTranscriptInput = {
  normalizedTranscript: string;
  normalizedTitle?: string;
  model: string;
  apiKey: string;
  inputProfile: TranscriptAnalysisInputProfile;
};

type PromptBundle = {
  systemPrompt: string;
  userPrompt: string;
  text: {
    format: OpenAiStructuredResponseFormat;
  };
};

type OpenAiResponsePayload = {
  error?: {
    message?: string;
  };
  incomplete_details?: {
    reason?: string;
  };
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
      refusal?: string;
    }>;
  }>;
};

function countWords(value: string): number {
  const words = value.match(/\S+/gu);
  return words?.length ?? 0;
}

function countLines(value: string): number {
  return value.split(/\r?\n/u).length;
}

function buildPreview(value: string, maxLength = 240): string {
  const collapsed = value.replace(/\s+/gu, " ").trim();
  return collapsed.length > maxLength
    ? `${collapsed.slice(0, maxLength - 1)}…`
    : collapsed;
}

async function runStage<T>({
  name,
  summary,
  stages,
  onStage,
  execute
}: {
  name: TranscriptAnalysisStageName;
  summary: string;
  stages: TranscriptAnalysisStageRecord[];
  onStage?: AnalyzeTranscriptInput["onStage"];
  execute: () => Promise<T>;
}): Promise<T> {
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const result = await execute();
  const completedAtMs = Date.now();

  const record: TranscriptAnalysisStageRecord = {
    name,
    startedAt,
    completedAt: new Date(completedAtMs).toISOString(),
    durationMs: completedAtMs - startedAtMs,
    summary
  };

  stages.push(record);

  if (onStage) {
    await onStage(record);
  }

  return result;
}

function extractOpenAiOutputText(payload: OpenAiResponsePayload): string | undefined {
  for (const outputItem of payload.output ?? []) {
    if (outputItem.type !== "message") {
      continue;
    }

    for (const contentItem of outputItem.content ?? []) {
      if (contentItem.type === "output_text" && contentItem.text?.trim()) {
        return contentItem.text;
      }

      if (contentItem.type === "refusal" && contentItem.refusal?.trim()) {
        throw new ExtractionFailure("refusal", "OpenAI refused to analyze the transcript.");
      }
    }
  }

  return undefined;
}

export async function analyzeTranscript({
  transcript,
  title,
  apiKey = process.env.OPENAI_API_KEY,
  model = process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL,
  signal,
  timeoutMs,
  maxAttempts,
  onAttempt,
  onStage
}: AnalyzeTranscriptInput): Promise<TranscriptAnalysisResult> {
  const pipelineStartedAtMs = Date.now();
  const stages: TranscriptAnalysisStageRecord[] = [];

  const normalizedInput = await runStage({
    name: "normalize_input",
    summary: "Trim and validate transcript input, then derive lightweight input statistics.",
    stages,
    onStage,
    execute: async (): Promise<NormalizedTranscriptInput> => {
      if (!apiKey) {
        throw new ExtractionFailure("configuration",
          "Missing OpenAI API key. Set OPENAI_API_KEY in your environment or pass apiKey explicitly."
        );
      }

      const normalizedTranscript = transcript.trim();

      if (!normalizedTranscript) {
        throw new ExtractionFailure("invalid_input", "Transcript cannot be empty.");
      }

      const normalizedTitle = title?.trim() || undefined;

      return {
        normalizedTranscript,
        model,
        apiKey,
        inputProfile: {
          title: normalizedTitle ?? "Untitled transcript",
          transcriptLengthChars: normalizedTranscript.length,
          transcriptLengthWords: countWords(normalizedTranscript),
          transcriptLineCount: countLines(normalizedTranscript),
          preview: buildPreview(normalizedTranscript)
        },
        ...(normalizedTitle ? { normalizedTitle } : {})
      };
    }
  });

  const prompts = await runStage({
    name: "build_prompt",
    summary: "Build the system prompt, user prompt, and JSON schema response contract.",
    stages,
    onStage,
    execute: async (): Promise<PromptBundle> => {
      const promptInput = normalizedInput.normalizedTitle
        ? {
            transcript: normalizedInput.normalizedTranscript,
            title: normalizedInput.normalizedTitle
          }
        : {
            transcript: normalizedInput.normalizedTranscript
          };

      return {
        systemPrompt: buildTranscriptMapSystemPrompt(),
        userPrompt: buildTranscriptMapUserPrompt(promptInput),
        text: {
          format: {
            type: "json_schema",
            name: TRANSCRIPT_MAP_SCHEMA_NAME,
            schema: transcriptMapJsonSchema as Record<string, unknown>,
            strict: true
          }
        }
      };
    }
  });

  const response = await runStage({
    name: "call_model",
    summary: "Send the prompt package to the OpenAI Responses API and collect the structured completion payload.",
    stages,
    onStage,
    execute: async (): Promise<TranscriptAnalysisResponse> => {
      const rawApiResponse = await sendOpenAiRequest({
        apiKey: normalizedInput.apiKey,
        body: JSON.stringify({
          model: normalizedInput.model,
          input: [
            {
              role: "system",
              content: prompts.systemPrompt
            },
            {
              role: "user",
              content: prompts.userPrompt
            }
          ],
          text: prompts.text
        }),
        ...(signal ? { signal } : {}),
        ...(timeoutMs !== undefined ? { timeoutMs } : {}),
        ...(maxAttempts !== undefined ? { maxAttempts } : {}),
        ...(onAttempt ? { onAttempt } : {})
      });
      let completion: OpenAiResponsePayload | undefined;

      try {
        completion = JSON.parse(rawApiResponse) as OpenAiResponsePayload;
      } catch {
        throw new ExtractionFailure("invalid_response", "OpenAI returned a non-JSON response.");
      }

      const rawContent = extractOpenAiOutputText(completion);

      if (!rawContent) {
        throw new ExtractionFailure("invalid_response", "OpenAI returned no text output.");
      }

      return { rawContent };
    }
  });

  const parsedResponse = await runStage({
    name: "parse_response",
    summary: "Parse the model payload into a JSON value.",
    stages,
    onStage,
    execute: async (): Promise<unknown> => {
      try {
        return parseJsonResponse(response.rawContent);
      } catch (error: unknown) {
        throw new ExtractionFailure("invalid_output", "OpenAI output was not valid JSON.", { cause: error });
      }
    }
  });

  const validatedMap = await runStage({
    name: "validate_map",
    summary: "Validate the structured response against the transcript graph schema and invariants.",
    stages,
    onStage,
    execute: async (): Promise<TranscriptMap> => {
      try {
        return parseTranscriptMap(parsedResponse);
      } catch (error: unknown) {
        throw new ExtractionFailure("invalid_output", "OpenAI output did not match the transcript graph schema.", { cause: error });
      }
    }
  });

  const map = await runStage({
    name: "finalize_result",
    summary: "Normalize final metadata and verify node excerpts against the input transcript.",
    stages,
    onStage,
    execute: async (): Promise<TranscriptMap> => {
      const finalizedMap: TranscriptMap = {
        ...validatedMap,
        version: TRANSCRIPT_MAP_SCHEMA_VERSION,
        source: {
          ...validatedMap.source,
          transcriptLengthChars: normalizedInput.inputProfile.transcriptLengthChars
        }
      };
      try {
        assertTranscriptMapGrounded(finalizedMap, normalizedInput.normalizedTranscript);
      } catch (error: unknown) {
        throw new ExtractionFailure("invalid_output", "OpenAI output was not grounded in the transcript.", { cause: error });
      }
      return finalizedMap;
    }
  });

  return {
    map,
    diagnostics: {
      input: normalizedInput.inputProfile,
      request: {
        provider: "openai",
        model: normalizedInput.model,
        responseFormat: "json_schema",
        strictSchema: true,
        schemaName: TRANSCRIPT_MAP_SCHEMA_NAME,
        schemaVersion: TRANSCRIPT_MAP_SCHEMA_VERSION
      },
      stages,
      totalDurationMs: Date.now() - pipelineStartedAtMs
    },
    prompts: {
      system: prompts.systemPrompt,
      user: prompts.userPrompt
    },
    response
  };
}
