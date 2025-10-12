import { showToast, Toast, environment } from "@raycast/api";
import { getConnection, closeConnection, testConnection } from "./utils/pg-connect";
import { runMigrations, getAppliedMigrations } from "./db/pg-migrate";
import { writeFileSync } from "fs";
import { join } from "path";

export default async function Command() {
  const toast = await showToast({
    style: Toast.Style.Animated,
    title: "Running database setup...",
  });

  try {
    // Test connection first
    const isConnected = await testConnection();

    if (!isConnected) {
      toast.style = Toast.Style.Failure;
      toast.title = "Database connection failed";
      toast.message = "Please check your database preferences";
      return;
    }

    const sql = getConnection();

    // Get currently applied migrations
    const appliedBefore = await getAppliedMigrations(sql);

    // Run migrations
    await runMigrations(sql);

    // Get updated applied migrations
    const appliedAfter = await getAppliedMigrations(sql);

    const newMigrationsCount = appliedAfter.length - appliedBefore.length;

    if (newMigrationsCount > 0) {
      toast.style = Toast.Style.Success;
      toast.title = "Database setup completed!";
      toast.message = `Applied ${newMigrationsCount} migration${newMigrationsCount !== 1 ? "s" : ""}`;

      // Disable the command after successful migration
      disableCommand();
    } else {
      toast.style = Toast.Style.Success;
      toast.title = "Database is up to date";
      toast.message = "No new migrations to apply";

      // Also disable if database is already set up
      disableCommand();
    }
  } catch (error) {
    console.error("Migration error:", error);

    toast.style = Toast.Style.Failure;
    toast.title = "Setup failed";
    toast.message = error instanceof Error ? error.message : "Unknown error occurred";
  } finally {
    await closeConnection();
  }
}

function disableCommand() {
  try {
    const flagPath = join(environment.supportPath, ".setup_completed");
    writeFileSync(flagPath, new Date().toISOString());
  } catch (error) {
    console.error("Failed to disable command:", error);
  }
}

// Check if command should be disabled
export async function isEnabled() {
  try {
    const flagPath = join(environment.supportPath, ".setup_completed");
    const fs = await import("fs");
    return !fs.existsSync(flagPath);
  } catch {
    return true;
  }
}
