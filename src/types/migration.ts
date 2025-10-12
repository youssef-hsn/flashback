import type postgres from "postgres";

export interface Migration {
  readonly version: string;
  readonly description: string;

  up(sql: postgres.Sql): Promise<void>;
  down?(sql: postgres.Sql): Promise<void>;
}

export abstract class BaseMigration implements Migration {
  abstract readonly version: string;
  abstract readonly description: string;

  abstract up(sql: postgres.Sql): Promise<void>;

  down?(sql: postgres.Sql): Promise<void>;
}
