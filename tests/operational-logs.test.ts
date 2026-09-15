import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { test } from "node:test";

import {
  logDatabaseOperation,
  logExtraction,
  observeHttpRequest
} from "../src/server/operational-logs.js";

class FakeRequest extends EventEmitter {
  method = "GET";
  url = "/";
  aborted = false;
}

class FakeResponse extends EventEmitter {
  statusCode = 200;
  headersSent = false;
  headers = new Map<string, string>();

  setHeader(name: string, value: string): this {
    this.headers.set(name, value);
    return this;
  }
}

function observedRequest(request: FakeRequest, response: FakeResponse) {
  const records: Array<Record<string, unknown>> = [];
  const context = observeHttpRequest(
    request as Pick<IncomingMessage, "method" | "url" | "once" | "removeListener" | "aborted">,
    response as Pick<ServerResponse, "setHeader" | "once" | "removeListener" | "headersSent" | "statusCode">,
    (record) => records.push(record)
  );
  return { context, records };
}

test("completed requests have a response ID and one safe route log", () => {
  const request = new FakeRequest();
  request.url = "/api/projects/123e4567-e89b-12d3-a456-426614174000?token=private-query";
  const response = new FakeResponse();
  const { context, records } = observedRequest(request, response);
  response.headersSent = true;
  response.emit("finish");
  response.emit("close");

  assert.equal(response.headers.get("X-Request-ID"), context.requestId);
  assert.match(context.requestId, /^[0-9a-f-]{36}$/u);
  assert.deepEqual(records.map((record) => record.event), ["http_request"]);
  assert.equal(records[0]?.route, "/api/projects/:id");
  assert.equal(records[0]?.outcome, "success");
  assert.equal(records[0]?.statusCode, 200);
  assert.ok(typeof records[0]?.durationMs === "number");
  assert.doesNotMatch(JSON.stringify(records), /private-query|123e4567/u);
});

test("failure logs carry safe model and database details without sensitive messages", () => {
  const request = new FakeRequest();
  request.method = "POST";
  request.url = "/api/transcript-map?transcript=private-transcript";
  const response = new FakeResponse();
  const { context, records } = observedRequest(request, response);
  const stages = [{ name: "call_model" as const, durationMs: 100, summary: "private-prompt" }];
  logExtraction(context, {
    outcome: "failure",
    statusCode: 502,
    durationMs: 123,
    transcriptLengthChars: 40,
    stages,
    failureKind: "invalid_output",
    attempts: 2,
    upstreamStatus: 502
  });
  const error = Object.assign(new Error("postgresql://user:private-password@db/secret"), {
    code: "28P01"
  });
  logDatabaseOperation(context, {
    operation: "save_project", outcome: "failure", durationMs: 8, error
  });
  response.statusCode = 500;
  response.headersSent = true;
  response.emit("finish");
  response.emit("close");

  assert.deepEqual(records.map((record) => record.event), [
    "transcript_extraction", "database_operation", "http_request"
  ]);
  assert.equal(records[0]?.requestId, context.requestId);
  assert.deepEqual(records[0]?.stages, [{ name: "call_model", durationMs: 100 }]);
  assert.equal(records[1]?.postgresCode, "28P01");
  assert.equal(records[2]?.outcome, "failure");
  assert.doesNotMatch(JSON.stringify(records), /private-transcript|private-prompt|private-password|secret/u);
});

test("aborted requests produce one client-disconnected completion log", () => {
  const request = new FakeRequest();
  request.method = "POST";
  request.url = "/api/transcript-map";
  const response = new FakeResponse();
  const { records } = observedRequest(request, response);
  request.aborted = true;
  request.emit("aborted");
  response.emit("close");
  response.emit("finish");

  assert.equal(records.length, 1);
  assert.equal(records[0]?.outcome, "client_disconnected");
  assert.equal(records[0]?.statusCode, null);
});
