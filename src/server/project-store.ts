import { randomUUID } from "node:crypto";

import { type Pool } from "pg";

import {
  parseProjectSaveInput,
  parseProjectSummary,
  parseSavedProject,
  type ProjectPage,
  type ProjectSaveInput,
  type ProjectSummary,
  type SavedProject
} from "../core/schema/project.js";
import { createDatabasePool } from "./database-pool.js";
import { assertMigrationsApplied } from "./db-migrations.js";
import { ProjectConflictError, ProjectNotFoundError } from "./project-errors.js";
import { encodeProjectCursor, type ProjectListOptions } from "./project-pagination.js";

const projectColumns = `
  id, title, transcript, map_json, position_overrides_json,
  selected_node_id, created_at, updated_at, version
`;

const insertProjectSql = `
  insert into transcript_projects (
    id, title, summary, transcript, map_json, position_overrides_json, selected_node_id
  ) values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)
  returning ${projectColumns}
`;

const updateProjectSql = `
  update transcript_projects set
    title = $2, summary = $3, transcript = $4,
    map_json = $5::jsonb, position_overrides_json = $6::jsonb,
    selected_node_id = $7, version = version + 1, updated_at = now()
  where id = $1 and version = $8
  returning ${projectColumns}
`;

function buildTranscriptPreview(transcript: string, maxLength = 240): string {
  const collapsed = transcript.replace(/\s+/gu, " ").trim();
  return collapsed.length > maxLength ? `${collapsed.slice(0, maxLength - 1)}…` : collapsed;
}

type ProjectRow = {
  id: string;
  title: string;
  transcript: string;
  map_json: unknown;
  position_overrides_json: unknown;
  selected_node_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  version: number;
};

type ProjectSummaryRow = {
  id: string;
  title: string;
  summary: string;
  transcript_preview: string;
  section_count: number;
  node_count: number;
  edge_count: number;
  created_at: Date | string;
  updated_at: Date | string;
  cursor_updated_at: string;
};

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapProjectRow(row: ProjectRow): SavedProject {
  return parseSavedProject({
    id: row.id,
    version: Number(row.version),
    title: row.title,
    transcript: row.transcript,
    map: row.map_json,
    positionOverrides: row.position_overrides_json,
    selectedNodeId: row.selected_node_id,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at)
  });
}

function mapProjectSummaryRow(row: ProjectSummaryRow): ProjectSummary {
  return parseProjectSummary({
    id: row.id,
    title: row.title,
    summary: row.summary,
    transcriptPreview: row.transcript_preview,
    sectionCount: Number(row.section_count),
    nodeCount: Number(row.node_count),
    edgeCount: Number(row.edge_count),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at)
  });
}

export class ProjectStore {
  readonly isEnabled: boolean;
  readonly unavailableReason?: string;

  #pool: Pool | null;
  #ownsPool: boolean;

  constructor(pool?: Pool) {
    if (pool) {
      this.isEnabled = true;
      this.#pool = pool;
      this.#ownsPool = false;
      return;
    }
    const connectionString = process.env.DATABASE_URL?.trim();
    if (!connectionString) {
      this.isEnabled = false;
      this.unavailableReason = "Persistence is unavailable because DATABASE_URL is not configured.";
      this.#pool = null;
      this.#ownsPool = false;
      return;
    }
    this.isEnabled = true;
    this.#pool = createDatabasePool(connectionString);
    this.#ownsPool = true;
  }

  async initialize(): Promise<void> {
    if (this.#pool) {
      await assertMigrationsApplied(this.#pool);
    }
  }

  async checkHealth(): Promise<boolean> {
    if (!this.#pool) {
      return true;
    }
    try {
      await this.#pool.query("select 1");
      return true;
    } catch {
      return false;
    }
  }

  async listProjects({ limit, cursor }: ProjectListOptions): Promise<ProjectPage> {
    const pool = this.#getPool();
    const where = cursor ? "where (updated_at, id) < ($1::timestamptz, $2::uuid)" : "";
    const params = cursor
      ? [cursor.updatedAt, cursor.id, limit + 1]
      : [limit + 1];
    const limitParameter = cursor ? "$3" : "$1";
    const result = await pool.query<ProjectSummaryRow>(`
      select
        id, title, summary,
        left(regexp_replace(transcript, '\\s+', ' ', 'g'), 240) as transcript_preview,
        coalesce(jsonb_array_length(map_json->'sections'), 0) as section_count,
        coalesce(jsonb_array_length(map_json->'nodes'), 0) as node_count,
        coalesce(jsonb_array_length(map_json->'edges'), 0) as edge_count,
        created_at, updated_at,
        to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as cursor_updated_at
      from transcript_projects
      ${where}
      order by updated_at desc, id desc
      limit ${limitParameter}
    `, params);
    const pageRows = result.rows.slice(0, limit);
    const lastRow = pageRows.at(-1);
    return {
      items: pageRows.map(mapProjectSummaryRow),
      nextCursor: result.rows.length > limit && lastRow
        ? encodeProjectCursor({ updatedAt: lastRow.cursor_updated_at, id: lastRow.id })
        : null
    };
  }

  async getProjectById(projectId: string): Promise<SavedProject | null> {
    const result = await this.#getPool().query<ProjectRow>(`
      select ${projectColumns} from transcript_projects where id = $1
    `, [projectId]);
    return result.rows[0] ? mapProjectRow(result.rows[0]) : null;
  }

  async saveProject(input: ProjectSaveInput): Promise<SavedProject> {
    const normalized = parseProjectSaveInput(input);
    const id = normalized.id ?? randomUUID();
    const params = [
      id,
      normalized.map.title,
      normalized.map.summary,
      normalized.transcript.trim(),
      JSON.stringify(normalized.map),
      JSON.stringify(normalized.positionOverrides),
      normalized.selectedNodeId ?? null
    ];
    const pool = this.#getPool();
    const result = normalized.id
      ? await pool.query<ProjectRow>(updateProjectSql, [...params, normalized.expectedVersion])
      : await pool.query<ProjectRow>(insertProjectSql, params);
    const row = result.rows[0];
    if (row) {
      return mapProjectRow(row);
    }
    if (normalized.id) {
      const exists = await pool.query("select 1 from transcript_projects where id = $1", [id]);
      throw exists.rowCount ? new ProjectConflictError() : new ProjectNotFoundError();
    }
    throw new Error("Project save returned no row.");
  }

  async close(): Promise<void> {
    if (this.#pool && this.#ownsPool) {
      await this.#pool.end();
    }
  }

  #getPool(): Pool {
    if (!this.#pool) {
      throw new Error(this.unavailableReason ?? "Persistence is unavailable.");
    }
    return this.#pool;
  }
}

export function projectSummaryFromSavedProject(project: SavedProject): ProjectSummary {
  return parseProjectSummary({
    id: project.id,
    title: project.title,
    summary: project.map.summary,
    transcriptPreview: buildTranscriptPreview(project.transcript),
    sectionCount: project.map.sections.length,
    nodeCount: project.map.nodes.length,
    edgeCount: project.map.edges.length,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt
  });
}
