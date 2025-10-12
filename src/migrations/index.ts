import type { Migration } from "../types/migration";
import { CreateSnapshotsMigration } from "./001-create-snapshots";
import { AddFulltextSearchMigration } from "./002-add-fulltext-search";
import { AddSoftDeleteMigration } from "./003-add-soft-delete";

/**
 * All migrations in order of execution
 * Add new migrations to the end of this array
 */
export const migrations: Migration[] = [
  new CreateSnapshotsMigration(),
  new AddFulltextSearchMigration(),
  new AddSoftDeleteMigration(),
];
