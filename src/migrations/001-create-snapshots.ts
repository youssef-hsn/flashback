import type postgres from "postgres";
import { BaseMigration } from "../types/migration";

/**
 * Migration 001: Create the snapshots (notes) table with anchor dates
 */
export class CreateSnapshotsMigration extends BaseMigration {
  readonly version = "001_create_snapshots";
  readonly description = "Create the snapshots table with indexes and triggers";

  async up(sql: postgres.Sql): Promise<void> {

    await sql`
      CREATE TABLE IF NOT EXISTS snapshots (
        id SERIAL PRIMARY KEY,
        content TEXT NOT NULL,
        anchor_date TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        tags TEXT[] DEFAULT '{}',
        metadata JSONB DEFAULT '{}'::jsonb
      )
    `;

    // Create index on anchor_date for efficient timeline queries
    await sql`
      CREATE INDEX IF NOT EXISTS idx_snapshots_anchor_date
      ON snapshots (anchor_date DESC)
    `;

    // Create index on created_at
    await sql`
      CREATE INDEX IF NOT EXISTS idx_snapshots_created_at
      ON snapshots (created_at DESC)
    `;

    // Create GIN index on tags for efficient tag searches
    await sql`
      CREATE INDEX IF NOT EXISTS idx_snapshots_tags
      ON snapshots USING GIN (tags)
    `;

    // Create GIN index on metadata for efficient JSON queries
    await sql`
      CREATE INDEX IF NOT EXISTS idx_snapshots_metadata
      ON snapshots USING GIN (metadata)
    `;

    // Create trigger to automatically update updated_at timestamp
    await sql`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ language 'plpgsql'
    `;

    await sql`
      CREATE TRIGGER update_snapshots_updated_at
      BEFORE UPDATE ON snapshots
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column()
    `;
  }

  async down(sql: postgres.Sql): Promise<void> {
    await sql`DROP TRIGGER IF EXISTS update_snapshots_updated_at ON snapshots`;
    await sql`DROP FUNCTION IF EXISTS update_updated_at_column()`;
    await sql`DROP TABLE IF EXISTS snapshots CASCADE`;
  }
}
