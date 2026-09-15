import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { Pool } from "pg";

import { projectSaveInputSchema } from "../src/core/schema/project.js";
import { assertMigrationsApplied, migrateDatabase } from "../src/server/db-migrations.js";
import { ProjectConflictError, ProjectNotFoundError, toProjectSaveApiError } from "../src/server/project-errors.js";
import {
  decodeProjectCursor,
  encodeProjectCursor,
  InvalidProjectListQuery,
  parseProjectListQuery
} from "../src/server/project-pagination.js";
import { ProjectStore } from "../src/server/project-store.js";
import { transcript, validMap } from "./fixtures.js";

test("project saves require a version for updates and none for new projects", () => {
  const map = validMap();
  const id = randomUUID();
  assert.equal(projectSaveInputSchema.safeParse({ transcript, map }).success, true);
  assert.equal(projectSaveInputSchema.safeParse({ id, transcript, map }).success, false);
  assert.equal(projectSaveInputSchema.safeParse({ id, expectedVersion: 1, transcript, map }).success, true);
  assert.equal(projectSaveInputSchema.safeParse({ expectedVersion: 1, transcript, map }).success, false);
});

test("project list queries validate bounds and canonical opaque cursors", () => {
  const cursor = {
    updatedAt: "2025-01-01T12:34:56.123456Z",
    id: randomUUID()
  };
  const encoded = encodeProjectCursor(cursor);
  assert.deepEqual(decodeProjectCursor(encoded), cursor);
  assert.deepEqual(parseProjectListQuery(new URLSearchParams()), { limit: 20, cursor: null });
  assert.deepEqual(parseProjectListQuery(new URLSearchParams(`limit=2&cursor=${encoded}`)), {
    limit: 2,
    cursor
  });
  for (const query of ["limit=0", "limit=51", "limit=abc", "limit=1&limit=2", "cursor=bad", "cursor="]) {
    assert.throws(() => parseProjectListQuery(new URLSearchParams(query)), InvalidProjectListQuery);
  }
});

test("project save errors map conflicts and missing rows to distinct API responses", () => {
  assert.deepEqual(toProjectSaveApiError(new ProjectConflictError()), {
    statusCode: 409,
    code: "project_conflict",
    message: "This project changed since it was opened. Your local edits were not saved."
  });
  assert.deepEqual(toProjectSaveApiError(new ProjectNotFoundError()), {
    statusCode: 404,
    code: "project_not_found",
    message: "Project not found."
  });
  assert.equal(toProjectSaveApiError(new Error("database connection secret")).message, "Unable to save project.");
});

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

async function withIsolatedSchema(run: (pool: Pool) => Promise<void>): Promise<void> {
  if (!testDatabaseUrl) {
    throw new Error("TEST_DATABASE_URL is required for PostgreSQL integration tests.");
  }
  const schema = `vt_test_${randomUUID().replace(/-/gu, "")}`;
  const admin = new Pool({ connectionString: testDatabaseUrl });
  try {
    await admin.query(`create schema "${schema}"`);
    const pool = new Pool({ connectionString: testDatabaseUrl, options: `-c search_path=${schema}` });
    try {
      await run(pool);
    } finally {
      await pool.end();
      await admin.query(`drop schema "${schema}" cascade`);
    }
  } finally {
    await admin.end();
  }
}

test("fresh migrations, stale saves, and tied timestamps paginate correctly", {
  skip: !testDatabaseUrl
}, async () => {
  await withIsolatedSchema(async (pool) => {
    await assert.rejects(assertMigrationsApplied(pool), /Database migrations are required/);
    assert.deepEqual(await migrateDatabase(pool), ["001_create_projects", "002_project_versions_and_listing"]);
    assert.deepEqual(await migrateDatabase(pool), []);
    await assertMigrationsApplied(pool);

    const store = new ProjectStore(pool);
    await store.initialize();
    const initial = await store.saveProject({ transcript, map: validMap(), positionOverrides: {} });
    assert.equal(initial.version, 1);
    const changed = await store.saveProject({
      id: initial.id,
      expectedVersion: initial.version,
      transcript,
      map: validMap(),
      positionOverrides: {}
    });
    assert.equal(changed.version, 2);
    await assert.rejects(
      store.saveProject({ id: initial.id, expectedVersion: 1, transcript, map: validMap(), positionOverrides: {} }),
      ProjectConflictError
    );
    assert.equal((await store.getProjectById(initial.id))?.version, 2);

    const ids = [initial.id];
    for (let index = 0; index < 4; index += 1) {
      const saved = await store.saveProject({ transcript, map: validMap(), positionOverrides: {} });
      ids.push(saved.id);
    }
    await pool.query("update transcript_projects set updated_at = '2025-01-01 12:34:56.123456+00'");
    const orderedIds = [...ids].sort().reverse();
    const first = await store.listProjects({ limit: 2, cursor: null });
    assert.deepEqual(first.items.map((project) => project.id), orderedIds.slice(0, 2));
    assert.ok(first.nextCursor);
    const second = await store.listProjects({ limit: 2, cursor: decodeProjectCursor(first.nextCursor) });
    assert.deepEqual(second.items.map((project) => project.id), orderedIds.slice(2, 4));
    assert.ok(second.nextCursor);
    const third = await store.listProjects({ limit: 2, cursor: decodeProjectCursor(second.nextCursor) });
    assert.deepEqual(third.items.map((project) => project.id), orderedIds.slice(4));
    assert.equal(third.nextCursor, null);
  });
});

test("migrations adopt the existing table and preserve its project rows", {
  skip: !testDatabaseUrl
}, async () => {
  await withIsolatedSchema(async (pool) => {
    const oldSql = await readFile(resolve("db/migrations/001_create_projects.sql"), "utf8");
    await pool.query(oldSql);
    const id = randomUUID();
    await pool.query(`
      insert into transcript_projects (id, title, summary, transcript, map_json)
      values ($1, $2, $3, $4, $5::jsonb)
    `, [id, "Legacy", "Existing project", transcript, JSON.stringify(validMap())]);

    assert.deepEqual(await migrateDatabase(pool), ["001_create_projects", "002_project_versions_and_listing"]);
    const store = new ProjectStore(pool);
    await store.initialize();
    const restored = await store.getProjectById(id);
    assert.equal(restored?.id, id);
    assert.equal(restored?.transcript, transcript);
    assert.equal(restored?.version, 1);
    assert.deepEqual(restored?.map, validMap());
  });
});
