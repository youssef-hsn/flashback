import type postgres from "postgres";
import { BaseMigration } from "../../types/migration";

/**
 * Migration 004: Create tags table with many-to-many relationship to snapshots
 */
export class CreateTagsMigration extends BaseMigration {
  readonly version = "004_create_tags";
  readonly description = "Create tags and snapshot_tags junction table for many-to-many relationship";

  async up(sql: postgres.Sql): Promise<void> {
    // Create tags table
    await sql`
      CREATE TABLE IF NOT EXISTS tags (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        slug VARCHAR(255) NOT NULL UNIQUE,
        color VARCHAR(7) DEFAULT NULL,
        description TEXT DEFAULT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    // Create index on slug for fast lookups
    await sql`
      CREATE INDEX IF NOT EXISTS idx_tags_slug
      ON tags (slug)
    `;

    // Create index on name for searches
    await sql`
      CREATE INDEX IF NOT EXISTS idx_tags_name
      ON tags (name)
    `;

    // Create junction table for many-to-many relationship
    await sql`
      CREATE TABLE IF NOT EXISTS snapshot_tags (
        snapshot_id INTEGER NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
        tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (snapshot_id, tag_id)
      )
    `;

    // Create indexes on foreign keys for efficient joins and cascading deletes
    await sql`
      CREATE INDEX IF NOT EXISTS idx_snapshot_tags_snapshot_id
      ON snapshot_tags (snapshot_id)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_snapshot_tags_tag_id
      ON snapshot_tags (tag_id)
    `;

    // Create trigger to update tags.updated_at
    await sql`
      CREATE TRIGGER update_tags_updated_at
      BEFORE UPDATE ON tags
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column()
    `;

    // Create a function to generate slug from name
    await sql`
      CREATE OR REPLACE FUNCTION generate_tag_slug(tag_name TEXT)
      RETURNS TEXT AS $$
      BEGIN
        RETURN lower(regexp_replace(trim(tag_name), '[^a-zA-Z0-9]+', '-', 'g'));
      END;
      $$ language 'plpgsql' IMMUTABLE
    `;

    // Create trigger to auto-generate slug from name if not provided
    await sql`
      CREATE OR REPLACE FUNCTION tags_slug_trigger()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NEW.slug IS NULL OR NEW.slug = '' THEN
          NEW.slug = generate_tag_slug(NEW.name);
        END IF;
        RETURN NEW;
      END;
      $$ language 'plpgsql'
    `;

    await sql`
      CREATE TRIGGER tags_slug_update
      BEFORE INSERT OR UPDATE OF name ON tags
      FOR EACH ROW
      EXECUTE FUNCTION tags_slug_trigger()
    `;

    // Migrate existing tags from snapshots.tags array to the new tables
    await sql`
      WITH tag_names AS (
        SELECT DISTINCT unnest(tags) as name
        FROM snapshots
        WHERE tags IS NOT NULL AND array_length(tags, 1) > 0
      )
      INSERT INTO tags (name, slug)
      SELECT
        name,
        generate_tag_slug(name)
      FROM tag_names
      WHERE name IS NOT NULL AND name != ''
      ON CONFLICT (name) DO NOTHING
    `;

    // Populate junction table from existing snapshot.tags arrays
    await sql`
      INSERT INTO snapshot_tags (snapshot_id, tag_id)
      SELECT DISTINCT
        s.id,
        t.id
      FROM snapshots s
      CROSS JOIN LATERAL unnest(s.tags) as tag_name
      JOIN tags t ON t.name = tag_name
      WHERE s.tags IS NOT NULL AND array_length(s.tags, 1) > 0
      ON CONFLICT (snapshot_id, tag_id) DO NOTHING
    `;

    // Note: We keep the tags array column for backward compatibility
    // It can be removed in a future migration after ensuring all code uses the new structure
  }

  async down(sql: postgres.Sql): Promise<void> {
    // Drop triggers
    await sql`DROP TRIGGER IF EXISTS tags_slug_update ON tags`;
    await sql`DROP TRIGGER IF EXISTS update_tags_updated_at ON tags`;

    // Drop functions
    await sql`DROP FUNCTION IF EXISTS tags_slug_trigger()`;
    await sql`DROP FUNCTION IF EXISTS generate_tag_slug(TEXT)`;

    // Drop tables (CASCADE will handle foreign key constraints)
    await sql`DROP TABLE IF EXISTS snapshot_tags CASCADE`;
    await sql`DROP TABLE IF EXISTS tags CASCADE`;
  }
}
