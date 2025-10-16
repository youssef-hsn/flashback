import { getConnection } from "../../utils/pg-connect";
import { Snapshot } from "../../types/snapshot";

export type SearchSnapshotsInput = {
  /** Full-text search query (searches in content) */
  query?: string;
  /** Filter by specific tags (all tags must match) */
  tags?: string[];
  /** Filter by any of these tags (at least one must match) */
  tagsAny?: string[];
  /** Sort direction based on anchor_date */
  sortOrder?: "asc" | "desc";
  /** Number of results to return (default: 50, max: 1000) */
  limit?: number;
  /** Number of results to skip (for pagination) */
  offset?: number;
  /** Filter by anchor date from */
  anchorDateFrom?: string | Date;
  /** Filter by anchor date to */
  anchorDateTo?: string | Date;
};

export type SearchSnapshotsResult = {
  snapshots: Snapshot[];
  total: number;
  hasMore: boolean;
};

/**
 * Search snapshots with full-text search, tag filtering, pagination, and sorting
 * @param input - Search parameters
 * @returns Search results with pagination info
 */
export async function searchSnapshots(
  input: SearchSnapshotsInput = {}
): Promise<SearchSnapshotsResult> {
  const sql = getConnection();

  // Set defaults
  const limit = Math.min(input.limit || 50, 1000);
  const offset = input.offset || 0;
  const sortOrder = input.sortOrder || "desc";

  const conditions: any[] = [];

  if (input.query) {
    const trimmedQuery = input.query.trim();
    if (trimmedQuery.length > 0) {
      const [tsqueryCheck] = await sql<[{ tsquery: string | null }]>`
        SELECT websearch_to_tsquery('english', ${trimmedQuery})::text as tsquery
      `;

      if (!tsqueryCheck.tsquery || tsqueryCheck.tsquery.trim() === '') {
        conditions.push(sql`s.content ~* ${trimmedQuery}`);
      } else {
        conditions.push(sql`s.content_search @@ websearch_to_tsquery('english', ${trimmedQuery})`);
      }
    }
  }

  if (input.anchorDateFrom) {
    conditions.push(sql`s.anchor_date >= ${input.anchorDateFrom}`);
  }

  if (input.anchorDateTo) {
    conditions.push(sql`s.anchor_date <= ${input.anchorDateTo}`);
  }

  if (input.tags && input.tags.length > 0) {
    conditions.push(sql`
      ${input.tags.length} = (
        SELECT COUNT(DISTINCT t.name)
        FROM snapshot_tags st
        JOIN tags t ON t.id = st.tag_id
        WHERE st.snapshot_id = s.id
        AND t.name = ANY(${input.tags})
      )
    `);
  }

  if (input.tagsAny && input.tagsAny.length > 0) {
    conditions.push(sql`
      EXISTS (
        SELECT 1
        FROM snapshot_tags st
        JOIN tags t ON t.id = st.tag_id
        WHERE st.snapshot_id = s.id
        AND t.name = ANY(${input.tagsAny})
      )
    `);
  }

  const whereClause = conditions.length > 0
    ? sql`WHERE ${conditions.reduce((a, b) => sql`${a} AND ${b}`)}`
    : sql``;

  const orderByClause = sortOrder === "asc"
    ? sql`ORDER BY s.anchor_date ASC`
    : sql`ORDER BY s.anchor_date DESC`;

  const [countResult] = await sql<[{ count: string }]>`
    SELECT COUNT(DISTINCT s.id) as count
    FROM snapshots s
    ${whereClause}
  `;
  const total = parseInt(countResult.count, 10);

  const snapshotsWithoutTags = await sql<Array<Omit<Snapshot, "tags">>>`
    SELECT DISTINCT
      s.id,
      s.content,
      s.anchor_date,
      s.created_at,
      s.updated_at,
      s.metadata
    FROM snapshots s
    ${whereClause}
    ${orderByClause}
    LIMIT ${limit}
    OFFSET ${offset}
  `;

  const snapshotIds = snapshotsWithoutTags.map(s => s.id);

  let tagsMap: Map<number, string[]> = new Map();

  if (snapshotIds.length > 0) {
    const tagResults = await sql<Array<{ snapshot_id: number; tag_name: string }>>`
      SELECT
        st.snapshot_id,
        t.name as tag_name
      FROM snapshot_tags st
      JOIN tags t ON t.id = st.tag_id
      WHERE st.snapshot_id = ANY(${snapshotIds})
      ORDER BY t.name
    `;

    for (const row of tagResults) {
      if (!tagsMap.has(row.snapshot_id)) {
        tagsMap.set(row.snapshot_id, []);
      }
      tagsMap.get(row.snapshot_id)!.push(row.tag_name);
    }
  }

  const snapshots: Snapshot[] = snapshotsWithoutTags.map(snapshot => ({
    ...snapshot,
    tags: tagsMap.get(snapshot.id) || [],
  }));

  return {
    snapshots,
    total,
    hasMore: offset + snapshots.length < total,
  };
}
