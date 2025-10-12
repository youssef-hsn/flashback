import { getConnection } from "../../utils/pg-connect";
import { Snapshot } from "../../types/snapshot";

export type CreateSnapshotInput = {
  content: string;
  anchor_date: string | Date;
  tags?: string[];
  metadata?: Record<string, any>;
};

/**
 * Creates a new snapshot in the database with tags
 * @param input - The snapshot data to insert
 * @returns The created snapshot with all fields populated including tags
 */
export async function createSnapshot(
  input: CreateSnapshotInput
): Promise<Snapshot> {
  const sql = getConnection();

  return await sql.begin(async (txn) => {
    const [snapshot] = await txn<
      Array<Omit<Snapshot, "tags">>
    >`
      INSERT INTO snapshots (
        content,
        anchor_date,
        metadata
      ) VALUES (
        ${input.content},
        ${input.anchor_date},
        ${JSON.stringify(input.metadata || {})}
      )
      RETURNING
        id,
        content,
        anchor_date,
        created_at,
        updated_at,
        metadata
    `;

    const tags: string[] = [];

    if (input.tags && input.tags.length > 0) {
      const tagNames = input.tags
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      if (tagNames.length > 0) {
        for (const tagName of tagNames) {
          const [tagRecord] = await txn<Array<{ id: number; name: string }>>`
            INSERT INTO tags (name)
            VALUES (${tagName})
            ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
            RETURNING id, name
          `;

          if (tagRecord) {
            await txn`
              INSERT INTO snapshot_tags (snapshot_id, tag_id)
              VALUES (${snapshot.id}, ${tagRecord.id})
              ON CONFLICT (snapshot_id, tag_id) DO NOTHING
            `;

            tags.push(tagRecord.name);
          }
        }
      }
    }

    return {
      ...snapshot,
      tags,
    };
  });
}
