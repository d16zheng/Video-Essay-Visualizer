import { randomUUID } from "node:crypto";

import { Pool, type PoolConfig } from "pg";

import {
  parseProjectSaveInput,
  parseProjectSummary,
  parseSavedProject,
  type ProjectSaveInput,
  type ProjectSummary,
  type SavedProject
} from "../core/schema/project.js";

const createProjectsTableSql = `
  create table if not exists transcript_projects (
    id uuid primary key,
    title text not null,
    summary text not null,
    transcript text not null,
    map_json jsonb not null,
    position_overrides_json jsonb not null default '{}'::jsonb,
    selected_node_id text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
`;

const upsertProjectSql = `
  insert into transcript_projects (
    id,
    title,
    summary,
    transcript,
    map_json,
    position_overrides_json,
    selected_node_id
  )
  values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)
  on conflict (id) do update set
    title = excluded.title,
    summary = excluded.summary,
    transcript = excluded.transcript,
    map_json = excluded.map_json,
    position_overrides_json = excluded.position_overrides_json,
    selected_node_id = excluded.selected_node_id,
    updated_at = now()
  returning
    id,
    title,
    transcript,
    map_json,
    position_overrides_json,
    selected_node_id,
    created_at,
    updated_at;
`;

function buildTranscriptPreview(transcript: string, maxLength = 240): string {
  const collapsed = transcript.replace(/\s+/gu, " ").trim();
  return collapsed.length > maxLength ? `${collapsed.slice(0, maxLength - 1)}…` : collapsed;
}

function readSslConfig(): PoolConfig["ssl"] | undefined {
  const sslMode = process.env.DATABASE_SSL ?? process.env.PGSSLMODE;

  if (sslMode === "require") {
    return {
      rejectUnauthorized: false
    };
  }

  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    return undefined;
  }

  try {
    const parsedUrl = new URL(databaseUrl);
    return parsedUrl.searchParams.get("sslmode") === "require"
      ? {
          rejectUnauthorized: false
        }
      : undefined;
  } catch {
    return undefined;
  }
}

type ProjectRow = {
  id: string;
  title: string;
  summary: string;
  transcript: string;
  map_json: unknown;
  position_overrides_json: unknown;
  selected_node_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
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
};

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapProjectRow(row: ProjectRow): SavedProject {
  return parseSavedProject({
    id: row.id,
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
    sectionCount: row.section_count,
    nodeCount: row.node_count,
    edgeCount: row.edge_count,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at)
  });
}

export class ProjectStore {
  readonly isEnabled: boolean;
  readonly unavailableReason?: string;

  #pool: Pool | null;

  constructor() {
    const connectionString = process.env.DATABASE_URL?.trim();

    if (!connectionString) {
      this.isEnabled = false;
      this.unavailableReason =
        "Persistence is unavailable because DATABASE_URL is not configured.";
      this.#pool = null;
      return;
    }

    this.isEnabled = true;
    this.#pool = new Pool({
      connectionString,
      ssl: readSslConfig()
    });
  }

  async initialize(): Promise<void> {
    if (!this.#pool) {
      return;
    }

    await this.#pool.query(createProjectsTableSql);
  }

  async listProjects(): Promise<ProjectSummary[]> {
    const pool = this.#getPool();
    const result = await pool.query<ProjectSummaryRow>(`
      select
        id,
        title,
        summary,
        left(regexp_replace(transcript, '\\s+', ' ', 'g'), 240) as transcript_preview,
        coalesce(jsonb_array_length(map_json->'sections'), 0) as section_count,
        coalesce(jsonb_array_length(map_json->'nodes'), 0) as node_count,
        coalesce(jsonb_array_length(map_json->'edges'), 0) as edge_count,
        created_at,
        updated_at
      from transcript_projects
      order by updated_at desc, created_at desc
    `);

    return result.rows.map(mapProjectSummaryRow);
  }

  async getProjectById(projectId: string): Promise<SavedProject | null> {
    const pool = this.#getPool();
    const result = await pool.query<ProjectRow>(
      `
        select
          id,
          title,
          summary,
          transcript,
          map_json,
          position_overrides_json,
          selected_node_id,
          created_at,
          updated_at
        from transcript_projects
        where id = $1
      `,
      [projectId]
    );

    return result.rows[0] ? mapProjectRow(result.rows[0]) : null;
  }

  async saveProject(input: ProjectSaveInput): Promise<SavedProject> {
    const pool = this.#getPool();
    const normalizedInput = parseProjectSaveInput(input);
    const projectId = normalizedInput.id ?? randomUUID();
    const result = await pool.query<ProjectRow>(upsertProjectSql, [
      projectId,
      normalizedInput.map.title,
      normalizedInput.map.summary,
      normalizedInput.transcript.trim(),
      JSON.stringify(normalizedInput.map),
      JSON.stringify(normalizedInput.positionOverrides),
      normalizedInput.selectedNodeId ?? null
    ]);

    const savedRow = result.rows[0];

    if (!savedRow) {
      throw new Error("Project save succeeded without returning a row.");
    }

    return mapProjectRow(savedRow);
  }

  async close(): Promise<void> {
    if (!this.#pool) {
      return;
    }

    await this.#pool.end();
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
