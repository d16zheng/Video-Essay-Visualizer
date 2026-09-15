import { ExtractionFailure } from "./extraction-failure.js";

const defaultTimeoutMs = 90_000;
const defaultMaxAttempts = 2;
const maxRetryDelayMs = 5_000;

export type OpenAiRequestOptions = {
  apiKey: string;
  body: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxAttempts?: number;
  // Allows focused tests to avoid real retry delays.
  retryBaseDelayMs?: number;
  fetchImpl?: typeof fetch;
};

function readPolicyValue(value: number | undefined, envValue: string | undefined, fallback: number): number {
  return value ?? (envValue === undefined ? fallback : Number(envValue));
}

function getRequestPolicy(options: OpenAiRequestOptions): {
  timeoutMs: number;
  maxAttempts: number;
  retryBaseDelayMs: number;
} {
  const timeoutMs = readPolicyValue(
    options.timeoutMs,
    process.env.OPENAI_REQUEST_TIMEOUT_MS,
    defaultTimeoutMs
  );
  const maxAttempts = readPolicyValue(
    options.maxAttempts,
    process.env.OPENAI_MAX_ATTEMPTS,
    defaultMaxAttempts
  );
  const retryBaseDelayMs = options.retryBaseDelayMs ?? 500;

  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300_000) {
    throw new ExtractionFailure("configuration", "OPENAI_REQUEST_TIMEOUT_MS must be between 1 and 300000 milliseconds.");
  }
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 3) {
    throw new ExtractionFailure("configuration", "OPENAI_MAX_ATTEMPTS must be between 1 and 3.");
  }
  if (!Number.isInteger(retryBaseDelayMs) || retryBaseDelayMs < 0) {
    throw new ExtractionFailure("configuration", "Retry delay must be a nonnegative integer.");
  }
  return { timeoutMs, maxAttempts, retryBaseDelayMs };
}

function retryAfterMs(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const seconds = Number(value);
  const delay = Number.isFinite(seconds) && seconds >= 0
    ? seconds * 1_000
    : Date.parse(value) - Date.now();
  return Number.isFinite(delay) && delay >= 0 ? delay : null;
}

function waitForRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(new ExtractionFailure("cancelled", "Extraction was cancelled."));
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(new ExtractionFailure("cancelled", "Extraction was cancelled."));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

type AttemptResult =
  | { ok: true; text: string }
  | { ok: false; status: number; retryAfter: string | null };

async function performAttempt(
  options: OpenAiRequestOptions,
  timeoutMs: number,
  attempt: number
): Promise<AttemptResult> {
  if (options.signal?.aborted) {
    throw new ExtractionFailure("cancelled", "Extraction was cancelled.", { attempts: attempt - 1 });
  }

  const controller = new AbortController();
  let timedOut = false;
  const onAbort = () => controller.abort();
  options.signal?.addEventListener("abort", onAbort, { once: true });
  if (options.signal?.aborted) {
    controller.abort();
  }
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await (options.fetchImpl ?? fetch)("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json"
      },
      body: options.body,
      signal: controller.signal
    });
    if (options.signal?.aborted || timedOut) {
      throw new ExtractionFailure(
        options.signal?.aborted ? "cancelled" : "timeout",
        options.signal?.aborted ? "Extraction was cancelled." : `OpenAI request timed out after ${timeoutMs} ms.`,
        { attempts: attempt }
      );
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      return { ok: false, status: response.status, retryAfter: response.headers.get("Retry-After") };
    }
    const text = await response.text();
    if (options.signal?.aborted || timedOut) {
      throw new ExtractionFailure(
        options.signal?.aborted ? "cancelled" : "timeout",
        options.signal?.aborted ? "Extraction was cancelled." : `OpenAI request timed out after ${timeoutMs} ms.`,
        { attempts: attempt }
      );
    }
    return { ok: true, text };
  } catch (error: unknown) {
    if (error instanceof ExtractionFailure) {
      throw error;
    }
    if (options.signal?.aborted) {
      throw new ExtractionFailure("cancelled", "Extraction was cancelled.", { attempts: attempt, cause: error });
    }
    if (timedOut) {
      throw new ExtractionFailure("timeout", `OpenAI request timed out after ${timeoutMs} ms.`, {
        attempts: attempt,
        cause: error
      });
    }
    throw new ExtractionFailure("network", "OpenAI request failed at the network boundary.", {
      attempts: attempt,
      cause: error
    });
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onAbort);
  }
}

export async function sendOpenAiRequest(options: OpenAiRequestOptions): Promise<string> {
  const { timeoutMs, maxAttempts, retryBaseDelayMs } = getRequestPolicy(options);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let result: AttemptResult;
    try {
      result = await performAttempt(options, timeoutMs, attempt);
    } catch (error: unknown) {
      if (
        error instanceof ExtractionFailure &&
        error.kind === "network" &&
        attempt < maxAttempts
      ) {
        await waitForRetry(
          Math.min(retryBaseDelayMs * 2 ** (attempt - 1), maxRetryDelayMs),
          options.signal
        );
        continue;
      }
      throw error;
    }

    if (result.ok) {
      return result.text;
    }

    const transient = result.status === 429 || result.status >= 500;
    if (transient && attempt < maxAttempts) {
      const backoff = Math.min(retryBaseDelayMs * 2 ** (attempt - 1), maxRetryDelayMs);
      const requestedDelay = retryAfterMs(result.retryAfter);
      if (requestedDelay !== null && requestedDelay > maxRetryDelayMs) {
        throw new ExtractionFailure(
          "upstream_unavailable",
          `OpenAI requested a retry delay longer than ${maxRetryDelayMs} ms.`,
          { attempts: attempt, upstreamStatus: result.status }
        );
      }
      await waitForRetry(Math.min(Math.max(backoff, requestedDelay ?? 0), maxRetryDelayMs), options.signal);
      continue;
    }
    throw new ExtractionFailure(
      transient ? "upstream_unavailable"
        : result.status === 401 || result.status === 403 ? "configuration" : "upstream_rejected",
      `OpenAI returned HTTP ${result.status}.`,
      { attempts: attempt, upstreamStatus: result.status }
    );
  }

  throw new ExtractionFailure("upstream_unavailable", "OpenAI retry limit reached.");
}
