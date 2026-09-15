import { createDatabasePool } from "./database-pool.js";
import { migrateDatabase } from "./db-migrations.js";

try {
  process.loadEnvFile?.();
} catch (error: unknown) {
  if (!(error instanceof Error) || !error.message.includes("ENOENT")) {
    throw error;
  }
}

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run database migrations.");
}

const pool = createDatabasePool(connectionString);
try {
  const applied = await migrateDatabase(pool);
  console.log(applied.length ? `Applied migrations: ${applied.join(", ")}` : "Database is already up to date.");
} finally {
  await pool.end();
}
