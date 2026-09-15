import { type TranscriptMap } from "../schema/transcript-map.js";
import { analyzeTranscript } from "./analyze-transcript.js";

export type ExtractTranscriptMapInput = {
  transcript: string;
  title?: string;
  apiKey?: string;
  model?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxAttempts?: number;
};

export async function extractTranscriptMap({
  transcript,
  title,
  apiKey,
  model,
  signal,
  timeoutMs,
  maxAttempts
}: ExtractTranscriptMapInput): Promise<TranscriptMap> {
  const result = await analyzeTranscript({
    transcript,
    ...(title ? { title } : {}),
    ...(apiKey ? { apiKey } : {}),
    ...(model ? { model } : {}),
    ...(signal ? { signal } : {}),
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    ...(maxAttempts !== undefined ? { maxAttempts } : {})
  });

  return result.map;
}
