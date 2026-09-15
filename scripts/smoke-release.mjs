import assert from "node:assert/strict";
import { spawn } from "node:child_process";

import { parseTranscriptMap } from "../dist/core/schema/transcript-map.js";
import { assertTranscriptMapGrounded } from "../dist/core/schema/transcript-grounding.js";

const username = "release-smoke";
const password = "release-smoke-password";
const transcript = "Thesis line.\nClaim line.\nEvidence line.";
const map = {
  version: "1.0.0",
  title: "Release smoke project",
  summary: "A short example graph.",
  thesisNodeId: "thesis",
  sections: [
    { id: "first", title: "Beginning", summary: "The argument.", order: 0, nodeIds: ["thesis", "claim"] },
    { id: "second", title: "Support", summary: "The evidence.", order: 1, nodeIds: ["evidence"] }
  ],
  nodes: [
    { id: "thesis", type: "thesis", label: "Thesis", summary: "The main idea.", sectionId: "first", transcriptSpan: { excerpt: "Thesis line." } },
    { id: "claim", type: "claim", label: "Claim", summary: "The claim.", sectionId: "first", transcriptSpan: { excerpt: "Claim line." } },
    { id: "evidence", type: "evidence", label: "Evidence", summary: "The support.", sectionId: "second", transcriptSpan: { excerpt: "Evidence line." } }
  ],
  edges: [{ id: "support", source: "evidence", target: "claim", relationship: "supports" }],
  source: { transcriptLengthChars: transcript.length, language: "en" }
};
assertTranscriptMapGrounded(parseTranscriptMap(map), transcript);
const server = spawn(process.execPath, ["dist/server/index.js"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    HOST: "127.0.0.1",
    PORT: "0",
    DATABASE_URL: process.env.DATABASE_URL ?? "",
    BASIC_AUTH_USERNAME: username,
    BASIC_AUTH_PASSWORD: password
  },
  stdio: ["ignore", "pipe", "pipe"]
});

let output = "";
server.stdout.setEncoding("utf8");
server.stderr.setEncoding("utf8");
server.stdout.on("data", (chunk) => { output += chunk; });
server.stderr.on("data", (chunk) => { output += chunk; });

async function waitForAddress() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const match = /server running at http:\/\/127\.0\.0\.1:(\d+)/u.exec(output);
    if (match) {
      return `http://127.0.0.1:${match[1]}`;
    }
    if (server.exitCode !== null || server.signalCode !== null) {
      throw new Error(`Server exited before becoming ready. ${output}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Server did not become ready within 10 seconds. ${output}`);
}

async function request(baseUrl, path, options) {
  return fetch(`${baseUrl}${path}`, { signal: AbortSignal.timeout(5_000), ...options });
}

async function waitForLog(requestId, event) {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    for (const line of output.split("\n")) {
      try {
        const record = JSON.parse(line);
        if (record.requestId === requestId && record.event === event) {
          return record;
        }
      } catch {
        // Startup messages and incomplete stream chunks are not JSON records.
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Missing ${event} record for request ${requestId}.`);
}

try {
  const baseUrl = await waitForAddress();
  const auth = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;

  const health = await request(baseUrl, "/health");
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true });
  const healthId = health.headers.get("X-Request-ID");
  assert.match(healthId ?? "", /^[0-9a-f-]{36}$/u);
  assert.equal((await waitForLog(healthId, "http_request")).route, "/health");

  const page = await request(baseUrl, "/");
  assert.equal(page.status, 200);
  assert.match(await page.text(), /\/assets\/app\.js/u);
  const asset = await request(baseUrl, "/assets/app.js");
  assert.equal(asset.status, 200);

  const unauthorized = await request(baseUrl, "/api/projects");
  assert.equal(unauthorized.status, 401);

  const projects = await request(baseUrl, "/api/projects", {
    headers: { Authorization: auth }
  });
  assert.equal(projects.status, process.env.DATABASE_URL ? 200 : 503);
  assert.equal((await projects.json()).ok, Boolean(process.env.DATABASE_URL));
  const projectsId = projects.headers.get("X-Request-ID");
  assert.equal((await waitForLog(projectsId, "database_operation")).requestId, projectsId);

  if (process.env.DATABASE_URL) {
    const saveBody = { transcript, map, positionOverrides: {} };
    const save = await request(baseUrl, "/api/projects", {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify(saveBody)
    });
    assert.equal(save.status, 200);
    const saved = (await save.json()).data;
    assert.equal(saved.version, 1);

    const reopened = await request(baseUrl, `/api/projects/${saved.id}`, {
      headers: { Authorization: auth }
    });
    assert.equal(reopened.status, 200);
    assert.equal((await reopened.json()).data.transcript, transcript);

    const updateBody = { ...saveBody, id: saved.id, expectedVersion: 1 };
    const update = await request(baseUrl, "/api/projects", {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify(updateBody)
    });
    assert.equal(update.status, 200);
    assert.equal((await update.json()).data.version, 2);

    const conflict = await request(baseUrl, "/api/projects", {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify(updateBody)
    });
    assert.equal(conflict.status, 409);
    assert.equal((await conflict.json()).code, "project_conflict");
  }

  const invalidExtraction = await request(baseUrl, "/api/transcript-map", {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({ transcript: "", secret: "do-not-log-this" })
  });
  assert.equal(invalidExtraction.status, 400);
  assert.equal((await invalidExtraction.json()).code, "invalid_request");
  assert.match(invalidExtraction.headers.get("Server-Timing") ?? "", /^extraction;dur=\d+$/u);
  const extractionId = invalidExtraction.headers.get("X-Request-ID");
  assert.equal((await waitForLog(extractionId, "transcript_extraction")).failureKind, "invalid_request");
  assert.equal((await waitForLog(extractionId, "http_request")).statusCode, 400);
  assert.doesNotMatch(output, /do-not-log-this/u);

  console.log(`Release smoke check passed: health, assets, auth, ${process.env.DATABASE_URL ? "save/reopen/conflict" : "persistence unavailable"}, extraction error path.`);
} finally {
  if (server.exitCode === null && server.signalCode === null) {
    server.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => server.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 2_000))
    ]);
    if (server.exitCode === null && server.signalCode === null) {
      server.kill("SIGKILL");
    }
  }
}
