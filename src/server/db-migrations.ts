import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { type Pool, type PoolClient } from "pg";

export const migrationIds = [
  "001_create_projects",
  "002_project_versions_and_listing"
] as const;

const migrationRequiredMessage = "Database migrations are required. Run npm run db:migrate before starting the app.";

async function verifyProjectColumns(client: Pick<PoolClient, "query">): Promise<void> {
  const expectedTypes: Record<string, string> = {
    id: "uuid",
    title: "text",
    summary: "text",
    transcript: "text",
    map_json: "jsonb",
    position_overrides_json: "jsonb",
    selected_node_id: "text",
    created_at: "timestamptz",
    updated_at: "timestamptz",
    version: "int4"
  };
  try {
    const result = await client.query<{ column_name: string; udt_name: string; is_nullable: string }>(`
      select column_name, udt_name, is_nullable
      from information_schema.columns
      where table_schema = current_schema() and table_name = 'transcript_projects'
    `);
    const columns = new Map(result.rows.map((row) => [row.column_name, row]));
    for (const [name, type] of Object.entries(expectedTypes)) {
      const column = columns.get(name);
      if (!column || column.udt_name !== type || (name === "version" && column.is_nullable !== "NO")) {
        throw new Error(`Incompatible column ${name}`);
      }
    }
  } catch {
    throw new Error("Database project table is incompatible with this app. Inspect its schema before migrating.");
  }
}

export async function assertMigrationsApplied(pool: Pool): Promise<void> {
  let applied: string[];
  try {
    const result = await pool.query<{ version: string }>("select version from schema_migrations order by version");
    applied = result.rows.map((row) => row.version);
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "42P01") {
      throw new Error(migrationRequiredMessage);
    }
    throw error;
  }
  if (applied.length !== migrationIds.length || applied.some((id, index) => id !== migrationIds[index])) {
    throw new Error(migrationRequiredMessage);
  }
  await verifyProjectColumns(pool);
}

export async function migrateDatabase(pool: Pool): Promise<string[]> {
  const client = await pool.connect();
  const newlyApplied: string[] = [];
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(778337401)");
    await client.query(`
      create table if not exists schema_migrations (
        version text primary key,
        checksum text not null,
        applied_at timestamptz not null default now()
      )
    `);
    const result = await client.query<{ version: string; checksum: string }>(
      "select version, checksum from schema_migrations"
    );
    const applied = new Map(result.rows.map((row) => [row.version, row.checksum]));
    for (const id of applied.keys()) {
      if (!migrationIds.some((known) => known === id)) {
        throw new Error(`Database has an unknown migration: ${id}.`);
      }
    }
    for (const id of migrationIds) {
      const sql = await readFile(resolve(process.cwd(), "db", "migrations", `${id}.sql`), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const previousChecksum = applied.get(id);
      if (previousChecksum && previousChecksum !== checksum) {
        throw new Error(`Applied migration ${id} has changed. Restore the original SQL before migrating.`);
      }
      if (previousChecksum) {
        continue;
      }
      await client.query(sql);
      await client.query("insert into schema_migrations (version, checksum) values ($1, $2)", [id, checksum]);
      newlyApplied.push(id);
    }
    await verifyProjectColumns(client);
    await client.query("commit");
    return newlyApplied;
  } catch (error: unknown) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
