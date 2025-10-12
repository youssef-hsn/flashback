import type postgres from "postgres";
import { BaseMigration } from "../types/migration";

/**
 * Migration 002: Create full-text search capability
 */
export class AddFulltextSearchMigration extends BaseMigration {
  readonly version = "002_add_fulltext_search";
  readonly description = "Add full-text search capability with tsvector column";

  async up(sql: postgres.Sql): Promise<void> {
    // Add a tsvector column for full-text search
    await sql`
      ALTER TABLE snapshots
      ADD COLUMN IF NOT EXISTS content_search tsvector
    `;

    // Create a function to update the tsvector column
    await sql`
      CREATE OR REPLACE FUNCTION snapshots_content_search_trigger()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.content_search = to_tsvector('english', COALESCE(NEW.content, ''));
        RETURN NEW;
      END;
      $$ language 'plpgsql'
    `;

    // Create trigger to automatically update content_search
    await sql`
      CREATE TRIGGER snapshots_content_search_update
      BEFORE INSERT OR UPDATE OF content ON snapshots
      FOR EACH ROW
      EXECUTE FUNCTION snapshots_content_search_trigger()
    `;

    // Update existing rows
    await sql`
      UPDATE snapshots
      SET content_search = to_tsvector('english', content)
      WHERE content_search IS NULL
    `;

    // Create GIN index for full-text search
    await sql`
      CREATE INDEX IF NOT EXISTS idx_snapshots_content_search
      ON snapshots USING GIN (content_search)
    `;
  }

  async down(sql: postgres.Sql): Promise<void> {
    await sql`DROP INDEX IF EXISTS idx_snapshots_content_search`;
    await sql`DROP TRIGGER IF EXISTS snapshots_content_search_update ON snapshots`;
    await sql`DROP FUNCTION IF EXISTS snapshots_content_search_trigger()`;
    await sql`ALTER TABLE snapshots DROP COLUMN IF EXISTS content_search`;
  }
}
