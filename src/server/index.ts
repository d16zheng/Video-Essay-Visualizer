import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { timingSafeEqual } from "node:crypto";
import { performance } from "node:perf_hooks";

import { parseProjectSaveInput } from "../core/schema/project.js";
import { extractTranscriptMap } from "../core/services/extract-transcript-map.js";
import { ProjectStore } from "./project-store.js";
import { ProjectConflictError, ProjectNotFoundError, toProjectSaveApiError } from "./project-errors.js";
import { InvalidProjectListQuery, parseProjectListQuery } from "./project-pagination.js";
import { ExtractionFailure } from "../core/services/extraction-failure.js";
import { toTranscriptApiError } from "./transcript-errors.js";
import { renderAppPage } from "../web/page.js";
import {
  logDatabaseOperation,
  logDatabaseStartupFailure,
  logExtraction,
  logUnhandledRouteError,
  observeHttpRequest,
  type HttpRequestContext,
  type StageDuration
} from "./operational-logs.js";

try {
  process.loadEnvFile?.();
} catch (error: unknown) {
  if (!(error instanceof Error) || !error.message.includes("ENOENT")) {
    throw error;
  }
}

const host = process.env.HOST ?? "127.0.0.1";
const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const maxBodySizeBytes = 1_000_000;
const projectStore = new ProjectStore();

try {
  await projectStore.initialize();
} catch (error: unknown) {
  logDatabaseStartupFailure(error);
  throw new Error("Database startup check failed.");
}

class HttpError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

function sendHtml(
  response: ServerResponse,
  html: string,
  headers: Record<string, string> = {}
): void {
  response.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers
  });
  response.end(html);
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  payload: Record<string, unknown>,
  headers: Record<string, string> = {}
): void {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers
  });
  response.end(JSON.stringify(payload));
}

function contentTypeForAsset(pathname: string): string {
  if (pathname.endsWith(".css")) {
    return "text/css; charset=utf-8";
  }

  if (pathname.endsWith(".js")) {
    return "text/javascript; charset=utf-8";
  }

  if (pathname.endsWith(".map")) {
    return "application/json; charset=utf-8";
  }

  return "application/octet-stream";
}

async function sendAsset(response: ServerResponse, pathname: string): Promise<void> {
  const assetName = pathname.replace(/^\/assets\//u, "");

  if (!assetName || assetName.includes("..")) {
    sendJson(response, 404, {
      ok: false,
      error: "Asset not found."
    });
    return;
  }

  try {
    const assetBuffer = await readFile(resolve(process.cwd(), "dist", "public", assetName));

    response.writeHead(200, {
      "Content-Type": contentTypeForAsset(pathname),
      "Cache-Control": "no-store"
    });
    response.end(assetBuffer);
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      sendJson(response, 404, {
        ok: false,
        error: "Asset not found."
      });
      return;
    }

    sendJson(response, 500, {
      ok: false,
      error: "Unable to read static asset."
    });
  }
}

function getConfiguredBasicAuth():
  | {
      username: string;
      password: string;
    }
  | null {
  const username = process.env.BASIC_AUTH_USERNAME?.trim();
  const password = process.env.BASIC_AUTH_PASSWORD?.trim();

  if (!username || !password) {
    return null;
  }

  return {
    username,
    password
  };
}

function constantTimeEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function requestHasValidBasicAuth(request: IncomingMessage): boolean {
  const configuredAuth = getConfiguredBasicAuth();

  if (!configuredAuth) {
    return true;
  }

  const authorizationHeader = request.headers.authorization;

  if (!authorizationHeader?.startsWith("Basic ")) {
    return false;
  }

  let decodedCredentials = "";

  try {
    decodedCredentials = Buffer.from(authorizationHeader.slice("Basic ".length), "base64").toString(
      "utf8"
    );
  } catch {
    return false;
  }

  const separatorIndex = decodedCredentials.indexOf(":");

  if (separatorIndex < 0) {
    return false;
  }

  const username = decodedCredentials.slice(0, separatorIndex);
  const password = decodedCredentials.slice(separatorIndex + 1);

  return (
    constantTimeEquals(username, configuredAuth.username) &&
    constantTimeEquals(password, configuredAuth.password)
  );
}

function requireBasicAuth(request: IncomingMessage, response: ServerResponse): boolean {
  if (requestHasValidBasicAuth(request)) {
    return true;
  }

  sendJson(
    response,
    401,
    {
      ok: false,
      error: "Authentication required."
    },
    {
      "WWW-Authenticate": 'Basic realm="Visualize Transcript"'
    }
  );
  return false;
}

async function readRequestBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    let bodySize = 0;
    let tooLarge = false;

    request.setEncoding("utf8");

    request.on("data", (chunk: string) => {
      bodySize += Buffer.byteLength(chunk);

      if (bodySize > maxBodySizeBytes && !tooLarge) {
        tooLarge = true;
        reject(new HttpError(413, "Transcript is too large for this first-pass endpoint."));
        request.pause();
        return;
      }

      body += chunk;
    });

    request.on("end", () => {
      resolve(body);
    });

    request.on("error", (error) => {
      reject(error);
    });
    request.on("aborted", () => {
      reject(new ExtractionFailure("cancelled", "Client disconnected while sending the transcript."));
    });
  });
}

async function parseJsonRequestBody(request: IncomingMessage): Promise<unknown> {
  const rawBody = await readRequestBody(request);

  try {
    return JSON.parse(rawBody);
  } catch {
    throw new HttpError(400, "Request body must be valid JSON.");
  }
}

async function parseTranscriptRequest(request: IncomingMessage): Promise<string> {
  const parsedBody = await parseJsonRequestBody(request);

  const transcript =
    typeof parsedBody === "object" &&
    parsedBody !== null &&
    "transcript" in parsedBody &&
    typeof parsedBody.transcript === "string"
      ? parsedBody.transcript
      : "";

  if (!transcript.trim()) {
    throw new HttpError(400, "Transcript is required.");
  }

  return transcript;
}

async function parseProjectSaveRequest(request: IncomingMessage) {
  const parsedBody = await parseJsonRequestBody(request);

  try {
    return parseProjectSaveInput(parsedBody);
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new HttpError(400, error.message);
    }

    throw error;
  }
}

function getProjectIdFromPathname(pathname: string): string | null {
  const projectRouteMatch = /^\/api\/projects\/([0-9a-f-]{36})$/u.exec(pathname);
  return projectRouteMatch?.[1] ?? null;
}

async function handleTranscriptMap(
  request: IncomingMessage,
  response: ServerResponse,
  context: HttpRequestContext
): Promise<void> {
  const startedAt = Date.now();
  const stages: StageDuration[] = [];
  let transcriptLengthChars: number | undefined;
  let attempts = 0;
  const controller = new AbortController();
  const onDisconnected = () => controller.abort();
  request.on("aborted", onDisconnected);
  response.on("close", onDisconnected);
  if (request.aborted || response.destroyed) {
    controller.abort();
  }
  let statusCode = 200;
  let failure: unknown;

  try {
    const transcript = await parseTranscriptRequest(request);
    transcriptLengthChars = transcript.length;
    const transcriptMap = await extractTranscriptMap({
      transcript,
      signal: controller.signal,
      onAttempt: (attempt) => { attempts = attempt; },
      onStage: ({ name, durationMs }) => { stages.push({ name, durationMs }); }
    });

    if (!response.destroyed) {
      sendJson(response, 200, {
        ok: true,
        data: transcriptMap
      }, { "Server-Timing": `extraction;dur=${Date.now() - startedAt}` });
    }
  } catch (error: unknown) {
    failure = error;
    const apiError = error instanceof HttpError
      ? { statusCode: error.statusCode, code: "invalid_request", message: error.message }
      : toTranscriptApiError(error);
    statusCode = apiError.statusCode;
    if (!response.destroyed) {
      sendJson(response, statusCode, {
        ok: false,
        code: apiError.code,
        error: apiError.message
      }, {
        "Server-Timing": `extraction;dur=${Date.now() - startedAt}`,
        ...(statusCode === 413 ? { Connection: "close" } : {})
      });
    }
  } finally {
    request.removeListener("aborted", onDisconnected);
    response.removeListener("close", onDisconnected);
    const extractionFailure = failure instanceof ExtractionFailure ? failure : null;
    const outcome = response.destroyed && !response.writableEnded
      ? "client_disconnected" : statusCode < 400 ? "success" : "failure";
    const failureKind = failure
      ? extractionFailure?.kind ?? (failure instanceof HttpError ? "invalid_request" : "internal_error")
      : undefined;
    logExtraction(context, {
      outcome,
      statusCode,
      durationMs: Date.now() - startedAt,
      stages,
      ...(transcriptLengthChars !== undefined ? { transcriptLengthChars } : {}),
      ...(failureKind ? { failureKind } : {}),
      attempts: Math.max(attempts, extractionFailure?.attempts ?? 0),
      ...(extractionFailure?.upstreamStatus !== undefined
        ? { upstreamStatus: extractionFailure.upstreamStatus }
        : {})
    });
  }
}

function ensurePersistenceEnabled(
  response: ServerResponse,
  context: HttpRequestContext,
  operation: "list_projects" | "load_project" | "save_project"
): boolean {
  if (projectStore.isEnabled) {
    return true;
  }

  logDatabaseOperation(context, { operation, outcome: "unavailable", durationMs: 0 });
  sendJson(response, 503, {
    ok: false,
    error: projectStore.unavailableReason ?? "Persistence is unavailable."
  });
  return false;
}

async function handleListProjects(
  response: ServerResponse,
  params: URLSearchParams,
  context: HttpRequestContext
): Promise<void> {
  if (!ensurePersistenceEnabled(response, context, "list_projects")) {
    return;
  }

  let options;
  try {
    options = parseProjectListQuery(params);
  } catch (error: unknown) {
    sendJson(response, 400, {
      ok: false,
      error: error instanceof InvalidProjectListQuery ? error.message : "Invalid project list query."
    });
    return;
  }

  const startedAt = performance.now();
  let projects;
  try {
    projects = await projectStore.listProjects(options);
    logDatabaseOperation(context, {
      operation: "list_projects", outcome: "success", durationMs: Math.round(performance.now() - startedAt)
    });
  } catch (error: unknown) {
    logDatabaseOperation(context, {
      operation: "list_projects", outcome: "failure", durationMs: Math.round(performance.now() - startedAt), error
    });
    if (!response.destroyed) {
      sendJson(response, 500, { ok: false, error: "Unable to list projects." });
    }
    return;
  }
  if (!response.destroyed) {
    sendJson(response, 200, { ok: true, data: projects });
  }
}

async function handleGetProject(
  response: ServerResponse,
  projectId: string,
  context: HttpRequestContext
): Promise<void> {
  if (!ensurePersistenceEnabled(response, context, "load_project")) {
    return;
  }

  const startedAt = performance.now();
  let project;
  try {
    project = await projectStore.getProjectById(projectId);
    logDatabaseOperation(context, {
      operation: "load_project", outcome: project ? "success" : "not_found",
      durationMs: Math.round(performance.now() - startedAt)
    });
  } catch (error: unknown) {
    logDatabaseOperation(context, {
      operation: "load_project", outcome: "failure", durationMs: Math.round(performance.now() - startedAt), error
    });
    if (!response.destroyed) {
      sendJson(response, 500, { ok: false, error: "Unable to load project." });
    }
    return;
  }

  if (response.destroyed) {
    return;
  }
  if (!project) {
    sendJson(response, 404, { ok: false, error: "Project not found." });
  } else {
    sendJson(response, 200, { ok: true, data: project });
  }
}

async function handleSaveProject(
  request: IncomingMessage,
  response: ServerResponse,
  context: HttpRequestContext
): Promise<void> {
  if (!ensurePersistenceEnabled(response, context, "save_project")) {
    return;
  }

  let input;
  try {
    input = await parseProjectSaveRequest(request);
  } catch (error: unknown) {
    sendJson(response, error instanceof HttpError ? error.statusCode : 500, {
      ok: false,
      code: error instanceof HttpError ? "invalid_project" : "project_save_error",
      error: error instanceof HttpError ? error.message : "Unable to save project."
    });
    return;
  }

  const startedAt = performance.now();
  let project;
  try {
    project = await projectStore.saveProject(input);
    logDatabaseOperation(context, {
      operation: "save_project", outcome: "success", durationMs: Math.round(performance.now() - startedAt)
    });
  } catch (error: unknown) {
    logDatabaseOperation(context, {
      operation: "save_project",
      outcome: error instanceof ProjectConflictError ? "conflict"
        : error instanceof ProjectNotFoundError ? "not_found" : "failure",
      durationMs: Math.round(performance.now() - startedAt),
      error
    });
    const apiError = toProjectSaveApiError(error);

    if (!response.destroyed) {
      sendJson(response, apiError.statusCode, {
        ok: false,
        code: apiError.code,
        error: apiError.message
      });
    }
    return;
  }
  if (!response.destroyed) {
    sendJson(response, 200, { ok: true, data: project });
  }
}

async function routeRequest(
  request: IncomingMessage,
  response: ServerResponse,
  context: HttpRequestContext
): Promise<void> {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", `http://${host}:${port}`);

  if (method === "GET" && url.pathname === "/") {
    sendHtml(response, renderAppPage());
    return;
  }

  if (method === "GET" && url.pathname.startsWith("/assets/")) {
    await sendAsset(response, url.pathname);
    return;
  }

  if (method === "GET" && url.pathname === "/health") {
    const healthy = await projectStore.checkHealth();
    sendJson(response, healthy ? 200 : 503, { ok: healthy });
    return;
  }

  if (!requireBasicAuth(request, response)) {
    return;
  }

  if (method === "POST" && url.pathname === "/api/transcript-map") {
    await handleTranscriptMap(request, response, context);
    return;
  }

  if (method === "GET" && url.pathname === "/api/projects") {
    await handleListProjects(response, url.searchParams, context);
    return;
  }

  if (method === "POST" && url.pathname === "/api/projects") {
    await handleSaveProject(request, response, context);
    return;
  }

  const projectId = getProjectIdFromPathname(url.pathname);

  if (method === "GET" && projectId) {
    await handleGetProject(response, projectId, context);
    return;
  }

  if (method === "OPTIONS" && url.pathname === "/api/transcript-map") {
    response.writeHead(204, {
      Allow: "POST, OPTIONS"
    });
    response.end();
    return;
  }

  if (method === "OPTIONS" && (url.pathname === "/api/projects" || projectId)) {
    response.writeHead(204, {
      Allow: "GET, POST, OPTIONS"
    });
    response.end();
    return;
  }

  sendJson(response, 404, {
    ok: false,
    error: "Route not found."
  });
}

const server = createServer((request, response) => {
  const context = observeHttpRequest(request, response);
  void routeRequest(request, response, context).catch(() => {
    logUnhandledRouteError(context);
    if (!response.destroyed) {
      sendJson(response, 500, { ok: false, error: "Unable to process request." });
    }
  });
});

server.listen(port, host, () => {
  const address = server.address();
  const listeningPort = address && typeof address !== "string" ? address.port : port;
  console.log(`Visualize Transcript server running at http://${host}:${listeningPort}`);
  if (!projectStore.isEnabled && projectStore.unavailableReason) {
    console.log(projectStore.unavailableReason);
  }
});
