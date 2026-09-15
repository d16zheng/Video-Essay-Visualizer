import { z } from "zod";

const cursorSchema = z.object({
  updatedAt: z.string().datetime({ offset: true }),
  id: z.string().uuid()
});

export type ProjectCursor = z.infer<typeof cursorSchema>;
export type ProjectListOptions = { limit: number; cursor: ProjectCursor | null };

export class InvalidProjectListQuery extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidProjectListQuery";
  }
}

export function encodeProjectCursor(cursor: ProjectCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export function decodeProjectCursor(value: string): ProjectCursor {
  if (!/^[A-Za-z0-9_-]{1,512}$/u.test(value)) {
    throw new InvalidProjectListQuery("Project cursor is invalid.");
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    const cursor = cursorSchema.parse(parsed);
    if (encodeProjectCursor(cursor) !== value) {
      throw new Error("Noncanonical cursor");
    }
    return cursor;
  } catch {
    throw new InvalidProjectListQuery("Project cursor is invalid.");
  }
}

export function parseProjectListQuery(params: URLSearchParams): ProjectListOptions {
  const rawLimit = params.get("limit");
  if (params.getAll("limit").length > 1 || params.getAll("cursor").length > 1) {
    throw new InvalidProjectListQuery("Project list query is invalid.");
  }
  const limit = rawLimit === null ? 20 : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new InvalidProjectListQuery("Project limit must be between 1 and 50.");
  }
  const rawCursor = params.get("cursor");
  return { limit, cursor: rawCursor === null ? null : decodeProjectCursor(rawCursor) };
}
