import assert from "node:assert/strict";
import { test } from "node:test";

import { analyzeTranscript } from "../src/core/services/analyze-transcript.js";
import { ExtractionFailure } from "../src/core/services/extraction-failure.js";
import { sendOpenAiRequest } from "../src/core/services/openai-request.js";
import { toTranscriptApiError } from "../src/server/transcript-errors.js";

const baseRequest = {
  apiKey: "test-key",
  body: "{}",
  timeoutMs: 100,
  maxAttempts: 2,
  retryBaseDelayMs: 1
};

function abortedFetch(signal: AbortSignal): Promise<Response> {
  return new Promise((_, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  });
}

test("transient HTTP and network failures retry, then return a successful response", async () => {
  let calls = 0;
  const attempts: number[] = [];
  const httpText = await sendOpenAiRequest({
    ...baseRequest,
    onAttempt: (attempt) => attempts.push(attempt),
    fetchImpl: async () => {
      calls += 1;
      return calls === 1
        ? new Response("busy", { status: 429, headers: { "Retry-After": "0" } })
        : new Response("complete", { status: 200 });
    }
  });
  assert.equal(httpText, "complete");
  assert.equal(calls, 2);
  assert.deepEqual(attempts, [1, 2]);

  calls = 0;
  const networkText = await sendOpenAiRequest({
    ...baseRequest,
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) {
        throw new TypeError("temporary connection failure");
      }
      return new Response("complete", { status: 200 });
    }
  });
  assert.equal(networkText, "complete");
  assert.equal(calls, 2);
});

test("retry limit and permanent HTTP failures preserve status without leaking upstream text", async () => {
  let calls = 0;
  await assert.rejects(
    sendOpenAiRequest({
      ...baseRequest,
      maxAttempts: 3,
      fetchImpl: async () => {
        calls += 1;
        return new Response("sensitive upstream detail", { status: 503 });
      }
    }),
    (error: unknown) => error instanceof ExtractionFailure &&
      error.kind === "upstream_unavailable" && error.attempts === 3 &&
      error.upstreamStatus === 503 && !error.message.includes("sensitive")
  );
  assert.equal(calls, 3);

  calls = 0;
  await assert.rejects(
    sendOpenAiRequest({
      ...baseRequest,
      fetchImpl: async () => {
        calls += 1;
        return new Response("sensitive upstream detail", { status: 400 });
      }
    }),
    (error: unknown) => error instanceof ExtractionFailure &&
      error.kind === "upstream_rejected" && error.attempts === 1
  );
  assert.equal(calls, 1);

  calls = 0;
  await assert.rejects(
    sendOpenAiRequest({
      ...baseRequest,
      fetchImpl: async () => {
        calls += 1;
        return new Response("invalid key detail", { status: 401 });
      }
    }),
    (error: unknown) => error instanceof ExtractionFailure &&
      error.kind === "configuration" && error.upstreamStatus === 401
  );
  assert.equal(calls, 1);

  calls = 0;
  await assert.rejects(
    sendOpenAiRequest({
      ...baseRequest,
      fetchImpl: async () => {
        calls += 1;
        return new Response("rate limited", { status: 429, headers: { "Retry-After": "120" } });
      }
    }),
    (error: unknown) => error instanceof ExtractionFailure &&
      error.kind === "upstream_unavailable" && error.attempts === 1
  );
  assert.equal(calls, 1);
});

test("timeout aborts an in-flight request and does not retry it", async () => {
  let calls = 0;
  const attempts: number[] = [];
  await assert.rejects(
    sendOpenAiRequest({
      ...baseRequest,
      timeoutMs: 10,
      onAttempt: (attempt) => attempts.push(attempt),
      fetchImpl: async (_, init) => {
        calls += 1;
        return abortedFetch(init?.signal as AbortSignal);
      }
    }),
    (error: unknown) => error instanceof ExtractionFailure &&
      error.kind === "timeout" && error.attempts === 1
  );
  assert.equal(calls, 1);
  assert.deepEqual(attempts, [1]);
});

test("caller cancellation aborts an in-flight request and retry delay", async () => {
  const controller = new AbortController();
  let calls = 0;
  const inFlight = sendOpenAiRequest({
    ...baseRequest,
    signal: controller.signal,
    fetchImpl: async (_, init) => {
      calls += 1;
      return abortedFetch(init?.signal as AbortSignal);
    }
  });
  setTimeout(() => controller.abort(), 5);
  await assert.rejects(inFlight, (error: unknown) => error instanceof ExtractionFailure && error.kind === "cancelled");
  assert.equal(calls, 1);

  const backoffController = new AbortController();
  calls = 0;
  const duringBackoff = sendOpenAiRequest({
    ...baseRequest,
    retryBaseDelayMs: 100,
    signal: backoffController.signal,
    fetchImpl: async () => {
      calls += 1;
      return new Response("busy", { status: 503 });
    }
  });
  setTimeout(() => backoffController.abort(), 5);
  await assert.rejects(duringBackoff, (error: unknown) => error instanceof ExtractionFailure &&
    error.kind === "cancelled" && error.attempts === 1);
  assert.equal(calls, 1);
});

test("refusal and malformed output do not enter the retry path", async () => {
  let calls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({
      output: [{ type: "message", content: [{ type: "refusal", refusal: "private refusal detail" }] }]
    }), { status: 200 });
  };
  try {
    await assert.rejects(
      analyzeTranscript({ transcript: "A short transcript.", apiKey: "test-key", maxAttempts: 3 }),
      (error: unknown) => error instanceof ExtractionFailure &&
        error.kind === "refusal" && !error.message.includes("private")
    );
    assert.equal(calls, 1);

    calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return new Response(JSON.stringify({
        output: [{ type: "message", content: [{ type: "output_text", text: "not-json" }] }]
      }), { status: 200 });
    };
    await assert.rejects(
      analyzeTranscript({ transcript: "A short transcript.", apiKey: "test-key", maxAttempts: 3 }),
      (error: unknown) => error instanceof ExtractionFailure && error.kind === "invalid_output"
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("API error mapping exposes stable messages and status codes", () => {
  const timeout = toTranscriptApiError(new ExtractionFailure("timeout", "network cause with secret"));
  assert.deepEqual(timeout, {
    statusCode: 504,
    code: "upstream_timeout",
    message: "Extraction timed out. Please retry."
  });
  assert.deepEqual(toTranscriptApiError(new ExtractionFailure("invalid_output", "raw transcript detail")), {
    statusCode: 502,
    code: "invalid_model_output",
    message: "Extraction returned an invalid graph. Please retry."
  });
  assert.equal(toTranscriptApiError(new Error("private internal detail")).message, "Unable to build transcript graph.");
});
