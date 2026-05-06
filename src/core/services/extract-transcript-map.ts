import { type TranscriptMap } from "../schema/transcript-map.js";
import { analyzeTranscript } from "./analyze-transcript.js";

export type ExtractTranscriptMapInput = {
  transcript: string;
  title?: string;
  apiKey?: string;
  model?: string;
};

export async function extractTranscriptMap({
  transcript,
  title,
  apiKey,
  model
}: ExtractTranscriptMapInput): Promise<TranscriptMap> {
  const result = await analyzeTranscript({
    transcript,
    ...(title ? { title } : {}),
    ...(apiKey ? { apiKey } : {}),
    ...(model ? { model } : {})
  });

  return result.map;
}
