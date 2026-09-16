import assert from "node:assert/strict";

const baseUrl = process.env.DEPLOYED_URL?.replace(/\/$/u, "");
const username = process.env.BASIC_AUTH_USERNAME;
const password = process.env.BASIC_AUTH_PASSWORD;

if (!baseUrl || !username || !password || !baseUrl.startsWith("https://")) {
  throw new Error("Set DEPLOYED_URL to the HTTPS service URL and provide BASIC_AUTH_USERNAME and BASIC_AUTH_PASSWORD.");
}

const transcript = "A city library opens on Saturdays. Volunteers help students find books. The library gives neighbors a quiet place to learn.";
const auth = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;

async function request(path, options = {}, timeoutMs = 15_000) {
  const response = await fetch(`${baseUrl}${path}`, {
    signal: AbortSignal.timeout(timeoutMs),
    ...options
  });
  assert.match(response.headers.get("X-Request-ID") ?? "", /^[0-9a-f-]{36}$/u);
  return response;
}

const health = await request("/health");
assert.equal(health.status, 200);
assert.deepEqual(await health.json(), { ok: true });

const page = await request("/");
assert.equal(page.status, 200);
assert.match(await page.text(), /\/assets\/app\.js/u);
assert.equal((await request("/assets/app.js")).status, 200);
assert.equal((await request("/api/projects")).status, 401);

const projects = await request("/api/projects", { headers: { Authorization: auth } });
assert.equal(projects.status, 200);
assert.equal((await projects.json()).ok, true);

const invalid = await request("/api/transcript-map", {
  method: "POST",
  headers: { Authorization: auth, "Content-Type": "application/json" },
  body: JSON.stringify({ transcript: "" })
});
assert.equal(invalid.status, 400);
assert.equal((await invalid.json()).code, "invalid_request");

const extraction = await request("/api/transcript-map", {
  method: "POST",
  headers: { Authorization: auth, "Content-Type": "application/json" },
  body: JSON.stringify({ transcript })
}, 240_000);
assert.equal(extraction.status, 200);
assert.match(extraction.headers.get("Server-Timing") ?? "", /^extraction;dur=\d+$/u);
const extracted = await extraction.json();
assert.equal(extracted.ok, true);
assert.ok(extracted.data.nodes.length >= 3);

const saveBody = { transcript, map: extracted.data, positionOverrides: {} };
const save = await request("/api/projects", {
  method: "POST",
  headers: { Authorization: auth, "Content-Type": "application/json" },
  body: JSON.stringify(saveBody)
});
assert.equal(save.status, 200);
const saved = (await save.json()).data;
assert.equal(saved.version, 1);

const reopened = await request(`/api/projects/${saved.id}`, { headers: { Authorization: auth } });
assert.equal(reopened.status, 200);
assert.equal((await reopened.json()).data.transcript, transcript);

const updateBody = { ...saveBody, id: saved.id, expectedVersion: 1 };
const update = await request("/api/projects", {
  method: "POST",
  headers: { Authorization: auth, "Content-Type": "application/json" },
  body: JSON.stringify(updateBody)
});
assert.equal(update.status, 200);
assert.equal((await update.json()).data.version, 2);

const conflict = await request("/api/projects", {
  method: "POST",
  headers: { Authorization: auth, "Content-Type": "application/json" },
  body: JSON.stringify(updateBody)
});
assert.equal(conflict.status, 409);
assert.equal((await conflict.json()).code, "project_conflict");

console.log(JSON.stringify({
  outcome: "passed",
  checks: "health, assets, auth, extraction, save, reopen, version conflict",
  extractionRequestId: extraction.headers.get("X-Request-ID")
}));
