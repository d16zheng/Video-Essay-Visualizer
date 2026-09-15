import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import type { IncomingMessage, ServerResponse } from "node:http";

import type { ExtractionFailureKind } from "../core/services/extraction-failure.js";
import type { TranscriptAnalysisStageName } from "../core/services/analyze-transcript.js";

type LogRecord = Record<string, string | number | null | object | undefined>;
type LogSink = (record: LogRecord) => void;

export type HttpRequestContext = {
  readonly requestId: string;
  readonly write: LogSink;
};

export type StageDuration = {
  name: TranscriptAnalysisStageName;
  durationMs: number;
};

function writeJsonLog(record: LogRecord): void {
  console.info(JSON.stringify(record));
}

function safeRoute(url: string | undefined): string {
  let pathname: string;
  try {
    pathname = new URL(url ?? "/", "http://localhost").pathname;
  } catch {
    return "unmatched";
  }
  if (pathname === "/" || pathname === "/health" || pathname === "/api/transcript-map"
    || pathname === "/api/projects") {
    return pathname;
  }
  if (pathname.startsWith("/assets/")) {
    return "/assets/*";
  }
  if (/^\/api\/projects\/[0-9a-f-]{36}$/u.test(pathname)) {
    return "/api/projects/:id";
  }
  return "unmatched";
}

function safeMethod(method: string | undefined): string {
  return method === "GET" || method === "POST" || method === "OPTIONS" ? method : "OTHER";
}

export function observeHttpRequest(
  request: Pick<IncomingMessage, "method" | "url" | "once" | "removeListener" | "aborted">,
  response: Pick<ServerResponse, "setHeader" | "once" | "removeListener" | "headersSent" | "statusCode">,
  write: LogSink = writeJsonLog
): HttpRequestContext {
  const requestId = randomUUID();
  const startedAt = performance.now();
  const route = safeRoute(request.url);
  const method = safeMethod(request.method);
  let completed = false;
  response.setHeader("X-Request-ID", requestId);

  const finish = () => complete("finished");
  const close = () => complete("client_disconnected");
  const aborted = () => complete("client_disconnected");
  function complete(reason: "finished" | "client_disconnected"): void {
    if (completed) {
      return;
    }
    completed = true;
    response.removeListener("finish", finish);
    response.removeListener("close", close);
    request.removeListener("aborted", aborted);
    const statusCode = response.headersSent ? response.statusCode : null;
    write({
      event: "http_request",
      requestId,
      method,
      route,
      outcome: reason === "client_disconnected" ? "client_disconnected"
        : response.statusCode < 400 ? "success" : "failure",
      statusCode,
      durationMs: Math.round(performance.now() - startedAt)
    });
  }

  response.once("finish", finish);
  response.once("close", close);
  request.once("aborted", aborted);
  if (request.aborted) {
    aborted();
  }
  return { requestId, write };
}

export function logExtraction(context: HttpRequestContext, details: {
  outcome: "success" | "failure" | "client_disconnected";
  statusCode: number;
  durationMs: number;
  transcriptLengthChars?: number;
  stages: StageDuration[];
  failureKind?: ExtractionFailureKind | "invalid_request" | "internal_error";
  attempts?: number;
  upstreamStatus?: number;
}): void {
  context.write({
    event: "transcript_extraction",
    requestId: context.requestId,
    outcome: details.outcome,
    statusCode: details.statusCode,
    durationMs: details.durationMs,
    transcriptLengthChars: details.transcriptLengthChars,
    stages: details.stages.map(({ name, durationMs }) => ({ name, durationMs })),
    failureKind: details.failureKind,
    attempts: details.attempts,
    upstreamStatus: details.upstreamStatus
  });
}

function safePostgresCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  const code = error.code;
  return typeof code === "string" && /^[0-9A-Z]{5}$/u.test(code) ? code : undefined;
}

export function logDatabaseOperation(context: HttpRequestContext, details: {
  operation: "list_projects" | "load_project" | "save_project";
  outcome: "success" | "not_found" | "conflict" | "failure" | "unavailable";
  durationMs: number;
  error?: unknown;
}): void {
  context.write({
    event: "database_operation",
    requestId: context.requestId,
    operation: details.operation,
    outcome: details.outcome,
    durationMs: details.durationMs,
    postgresCode: safePostgresCode(details.error)
  });
}

export function logUnhandledRouteError(context: HttpRequestContext): void {
  context.write({ event: "unhandled_route_error", requestId: context.requestId });
}

export function logDatabaseStartupFailure(error: unknown): void {
  writeJsonLog({ event: "database_startup_failure", postgresCode: safePostgresCode(error) });
}
