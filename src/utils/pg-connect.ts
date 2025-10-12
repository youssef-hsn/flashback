import { getPreferenceValues } from "@raycast/api";
import { Preferences } from "../types/prefrences";
import postgres from "postgres";


let sql: ReturnType<typeof postgres> | null = null;

export function getConnection() {
  if (sql) {
    return sql;
  }

  const preferences = getPreferenceValues<Preferences>();

  sql = postgres({
    host: preferences.dbHost || "localhost",
    port: parseInt(preferences.dbPort || "5432", 10),
    database: preferences.dbName,
    username: preferences.dbUser,
    password: preferences.dbPassword || "",
    max: 3,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  return sql;
}

export async function closeConnection() {
  if (sql) {
    await sql.end();
    sql = null;
  }
}

export async function testConnection(): Promise<boolean> {
  try {
    const connection = getConnection();
    await connection`SELECT 1`;
    return true;
  } catch (error) {
    console.error("Database connection failed:", error);
    return false;
  }
}
