import type postgres from "postgres";
import { BaseMigration } from "../../types/migration";

/**
 * Migration 003: Add deleted_at for soft deletes
 */
export class AddSoftDeleteMigration extends BaseMigration {
  readonly version = "003_add_soft_delete";
  readonly description = "Add soft delete capability with deleted_at column";

  async up(sql: postgres.Sql): Promise<void> {
    // Add deleted_at column
    await sql`
      ALTER TABLE snapshots
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL
    `;

    // Create index for active (non-deleted) snapshots
    await sql`
      CREATE INDEX IF NOT EXISTS idx_snapshots_deleted_at
      ON snapshots (deleted_at)
      WHERE deleted_at IS NULL
    `;
  }

  async down(sql: postgres.Sql): Promise<void> {
    await sql`DROP INDEX IF EXISTS idx_snapshots_deleted_at`;
    await sql`ALTER TABLE snapshots DROP COLUMN IF EXISTS deleted_at`;
  }
}
