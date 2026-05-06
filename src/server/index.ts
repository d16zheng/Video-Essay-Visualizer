import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { extractTranscriptMap } from "../core/services/extract-transcript-map.js";
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

class HttpError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

function sendHtml(response: ServerResponse, html: string): void {
  response.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(html);
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  payload: Record<string, unknown>
): void {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
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

async function parseTranscriptRequest(request: IncomingMessage): Promise<string> {
  const rawBody = await readRequestBody(request);

  let parsedBody: unknown;

  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    throw new HttpError(400, "Request body must be valid JSON.");
  }

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

  if (method === "POST" && url.pathname === "/api/transcript-map") {
    await handleTranscriptMap(request, response);
    return;
  }

  if (method === "OPTIONS" && url.pathname === "/api/transcript-map") {
    response.writeHead(204, {
      Allow: "POST, OPTIONS"
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
});
