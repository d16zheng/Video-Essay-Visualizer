import { ExtractionFailure } from "../core/services/extraction-failure.js";

export type TranscriptApiError = {
  statusCode: number;
  code: string;
  message: string;
};

export function toTranscriptApiError(error: unknown): TranscriptApiError {
  if (!(error instanceof ExtractionFailure)) {
    return { statusCode: 500, code: "internal_error", message: "Unable to build transcript graph." };
  }

  switch (error.kind) {
    case "cancelled":
      return { statusCode: 408, code: "cancelled", message: "Extraction was cancelled." };
    case "configuration":
      return { statusCode: 503, code: "configuration_error", message: "Extraction is not configured on this server." };
    case "invalid_input":
      return { statusCode: 400, code: "invalid_input", message: "Transcript is required." };
    case "timeout":
      return { statusCode: 504, code: "upstream_timeout", message: "Extraction timed out. Please retry." };
    case "network":
    case "upstream_unavailable":
      return { statusCode: 503, code: "upstream_unavailable", message: "Extraction service is temporarily unavailable. Please retry." };
    case "upstream_rejected":
      return { statusCode: 502, code: "upstream_rejected", message: "Extraction service rejected the request." };
    case "refusal":
      return { statusCode: 422, code: "model_refusal", message: "The model declined to analyze this transcript." };
    case "invalid_response":
    case "invalid_output":
      return { statusCode: 502, code: "invalid_model_output", message: "Extraction returned an invalid graph. Please retry." };
  }
}
