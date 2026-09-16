import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const transcript = "A city library opens on Saturdays. Volunteers help students find books. The library gives neighbors a quiet place to learn.";
const server = spawn(process.execPath, ["dist/server/index.js"], {
  cwd: process.cwd(),
  env: { ...process.env, HOST: "127.0.0.1", PORT: "0", DATABASE_URL: "" },
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
    if (match) return `http://127.0.0.1:${match[1]}`;
    if (server.exitCode !== null) throw new Error("Local server exited before becoming ready.");
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Local server did not become ready.");
}

async function waitForLog(requestId) {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    for (const line of output.split("\n")) {
      try {
        const record = JSON.parse(line);
        if (record.requestId === requestId && record.event === "transcript_extraction") return record;
      } catch {
        // Ignore startup text and incomplete chunks.
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Missing extraction log for request ${requestId}.`);
}

try {
  const baseUrl = await waitForAddress();
  const response = await fetch(`${baseUrl}/api/transcript-map`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcript }),
    signal: AbortSignal.timeout(240_000)
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ok, true);
  const requestId = response.headers.get("X-Request-ID");
  assert.match(requestId ?? "", /^[0-9a-f-]{36}$/u);
  const record = await waitForLog(requestId);
  assert.equal(record.outcome, "success");
  assert.ok(record.durationMs > 0);
  assert.ok(record.attempts >= 1);
  assert.equal(record.failureKind, undefined);

  const invalid = await fetch(`${baseUrl}/api/transcript-map`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcript: "" }),
    signal: AbortSignal.timeout(10_000)
  });
  assert.equal(invalid.status, 400);
  const invalidRecord = await waitForLog(invalid.headers.get("X-Request-ID"));
  assert.equal(invalidRecord.failureKind, "invalid_request");
  assert.equal(invalidRecord.attempts, 0);
  assert.ok(invalidRecord.durationMs >= 0);

  console.log(JSON.stringify({
    outcome: "passed", requestId, durationMs: record.durationMs,
    attempts: record.attempts, failureCategoryVerified: invalidRecord.failureKind
  }));
} finally {
  if (server.exitCode === null) {
    server.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => server.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 2_000))
    ]);
    if (server.exitCode === null) server.kill("SIGKILL");
  }
}
