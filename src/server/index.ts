import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { timingSafeEqual } from "node:crypto";

import { parseProjectSaveInput } from "../core/schema/project.js";
import { extractTranscriptMap } from "../core/services/extract-transcript-map.js";
import { ProjectStore } from "./project-store.js";
import { renderAppPage } from "../web/page.js";

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

await projectStore.initialize();

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

    request.setEncoding("utf8");

    request.on("data", (chunk: string) => {
      bodySize += Buffer.byteLength(chunk);

      if (bodySize > maxBodySizeBytes) {
        reject(new HttpError(413, "Transcript is too large for this first-pass endpoint."));
        request.destroy();
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
  response: ServerResponse
): Promise<void> {
  try {
    const transcript = await parseTranscriptRequest(request);
    const transcriptMap = await extractTranscriptMap({ transcript });

    sendJson(response, 200, {
      ok: true,
      data: transcriptMap
    });
  } catch (error: unknown) {
    const statusCode = error instanceof HttpError ? error.statusCode : 500;
    const message =
      error instanceof Error ? error.message : "Unexpected server error while building transcript graph.";

    sendJson(response, statusCode, {
      ok: false,
      error: message
    });
  }
}

function ensurePersistenceEnabled(response: ServerResponse): boolean {
  if (projectStore.isEnabled) {
    return true;
  }

  sendJson(response, 503, {
    ok: false,
    error: projectStore.unavailableReason ?? "Persistence is unavailable."
  });
  return false;
}

async function handleListProjects(response: ServerResponse): Promise<void> {
  if (!ensurePersistenceEnabled(response)) {
    return;
  }

  try {
    const projects = await projectStore.listProjects();
    sendJson(response, 200, {
      ok: true,
      data: projects
    });
  } catch (error: unknown) {
    sendJson(response, 500, {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to list projects."
    });
  }
}

async function handleGetProject(response: ServerResponse, projectId: string): Promise<void> {
  if (!ensurePersistenceEnabled(response)) {
    return;
  }

  try {
    const project = await projectStore.getProjectById(projectId);

    if (!project) {
      sendJson(response, 404, {
        ok: false,
        error: "Project not found."
      });
      return;
    }

    sendJson(response, 200, {
      ok: true,
      data: project
    });
  } catch (error: unknown) {
    sendJson(response, 500, {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to load project."
    });
  }
}

async function handleSaveProject(
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  if (!ensurePersistenceEnabled(response)) {
    return;
  }

  try {
    const input = await parseProjectSaveRequest(request);
    const project = await projectStore.saveProject(input);

    sendJson(response, 200, {
      ok: true,
      data: project
    });
  } catch (error: unknown) {
    const statusCode = error instanceof HttpError ? error.statusCode : 500;
    const message = error instanceof Error ? error.message : "Unable to save project.";

    sendJson(response, statusCode, {
      ok: false,
      error: message
    });
  }
}

async function routeRequest(
  request: IncomingMessage,
  response: ServerResponse
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
    sendJson(response, 200, { ok: true });
    return;
  }

  if (!requireBasicAuth(request, response)) {
    return;
  }

  if (method === "POST" && url.pathname === "/api/transcript-map") {
    await handleTranscriptMap(request, response);
    return;
  }

  if (method === "GET" && url.pathname === "/api/projects") {
    await handleListProjects(response);
    return;
  }

  if (method === "POST" && url.pathname === "/api/projects") {
    await handleSaveProject(request, response);
    return;
  }

  const projectId = getProjectIdFromPathname(url.pathname);

  if (method === "GET" && projectId) {
    await handleGetProject(response, projectId);
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
  void routeRequest(request, response);
});

server.listen(port, host, () => {
  console.log(`Visualize Transcript server running at http://${host}:${port}`);
  if (!projectStore.isEnabled && projectStore.unavailableReason) {
    console.log(projectStore.unavailableReason);
  }
});
