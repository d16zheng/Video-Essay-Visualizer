import { type TranscriptMap } from "../schema/transcript-map.js";
import { analyzeTranscript, type AnalyzeTranscriptInput } from "./analyze-transcript.js";

export type ExtractTranscriptMapInput = {
  transcript: string;
  title?: string;
  apiKey?: string;
  model?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxAttempts?: number;
  onAttempt?: AnalyzeTranscriptInput["onAttempt"];
  onStage?: AnalyzeTranscriptInput["onStage"];
};

export async function extractTranscriptMap({
  transcript,
  title,
  apiKey,
  model,
  signal,
  timeoutMs,
  maxAttempts,
  onAttempt,
  onStage
}: ExtractTranscriptMapInput): Promise<TranscriptMap> {
  const result = await analyzeTranscript({
    transcript,
    ...(title ? { title } : {}),
    ...(apiKey ? { apiKey } : {}),
    ...(model ? { model } : {}),
    ...(signal ? { signal } : {}),
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    ...(maxAttempts !== undefined ? { maxAttempts } : {}),
    ...(onAttempt ? { onAttempt } : {}),
    ...(onStage ? { onStage } : {})
  });

  return result.map;
}
