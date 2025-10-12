import type postgres from "postgres";
import { migrations } from "./migrations";

async function createMigrationsTable(sql: postgres.Sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      version VARCHAR(255) UNIQUE NOT NULL,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
}

async function isMigrationApplied(sql: postgres.Sql, version: string): Promise<boolean> {
  const result = await sql`
    SELECT 1 FROM schema_migrations WHERE version = ${version}
  `;
  return result.length > 0;
}

async function recordMigration(sql: postgres.Sql, version: string) {
  await sql`
    INSERT INTO schema_migrations (version)
    VALUES (${version})
    ON CONFLICT (version) DO NOTHING
  `;
}

export async function runMigrations(sql: postgres.Sql) {
  try {
    console.log("Starting database migrations...");

    await createMigrationsTable(sql);

    for (const migration of migrations) {
      if (await isMigrationApplied(sql, migration.version)) {
        console.log(`Migration ${migration.version} already applied, skipping...`);
        continue;
      }

      console.log(`Applying migration ${migration.version}: ${migration.description}...`);
      await migration.up(sql);
      await recordMigration(sql, migration.version);
      console.log(`Migration ${migration.version} applied successfully`);
    }

    console.log("All migrations completed successfully");
  } catch (error) {
    console.error("Migration failed:", error);
    throw error;
  }
}

export async function rollback(sql: postgres.Sql, count: number = 1) {
  const appliedMigrations = await getAppliedMigrations(sql);
  const migrationsToRollback = appliedMigrations.slice(-count).reverse();

  for (const version of migrationsToRollback) {
    const migration = migrations.find((m) => m.version === version);

    if (!migration) {
      console.warn(`Migration ${version} not found in migrations array`);
      continue;
    }

    if (!migration.down) {
      console.warn(`Migration ${version} does not have a down() method`);
      continue;
    }

    console.log(`Rolling back migration ${version}...`);
    await migration.down(sql);

    await sql`DELETE FROM schema_migrations WHERE version = ${version}`;
    console.log(`Migration ${version} rolled back successfully`);
  }
}

export async function getAppliedMigrations(sql: postgres.Sql): Promise<string[]> {
  try {
    const result = await sql`
      SELECT version FROM schema_migrations ORDER BY applied_at ASC
    `;
    return result.map((row) => row.version);
  } catch (error) {
    return [];
  }
}
