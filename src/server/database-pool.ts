import { Pool, type PoolConfig } from "pg";

function readSslConfig(connectionString: string): PoolConfig["ssl"] | undefined {
  const sslMode = process.env.DATABASE_SSL ?? process.env.PGSSLMODE;
  if (sslMode === "require") {
    return { rejectUnauthorized: false };
  }
  try {
    return new URL(connectionString).searchParams.get("sslmode") === "require"
      ? { rejectUnauthorized: false }
      : undefined;
  } catch {
    return undefined;
  }
}

export function createDatabasePool(connectionString: string): Pool {
  return new Pool({ connectionString, ssl: readSslConfig(connectionString) });
}
