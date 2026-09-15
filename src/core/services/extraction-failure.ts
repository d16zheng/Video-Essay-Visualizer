export type ExtractionFailureKind =
  | "cancelled"
  | "configuration"
  | "invalid_input"
  | "invalid_output"
  | "invalid_response"
  | "network"
  | "refusal"
  | "timeout"
  | "upstream_rejected"
  | "upstream_unavailable";

export class ExtractionFailure extends Error {
  readonly kind: ExtractionFailureKind;
  readonly attempts: number;
  readonly upstreamStatus?: number;

  constructor(
    kind: ExtractionFailureKind,
    message: string,
    options: { attempts?: number; upstreamStatus?: number; cause?: unknown } = {}
  ) {
    super(message, { cause: options.cause });
    this.name = "ExtractionFailure";
    this.kind = kind;
    this.attempts = options.attempts ?? 0;
    if (options.upstreamStatus !== undefined) {
      this.upstreamStatus = options.upstreamStatus;
    }
  }
}
