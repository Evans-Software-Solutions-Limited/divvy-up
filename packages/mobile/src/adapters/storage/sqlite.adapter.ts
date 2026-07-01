import * as SQLite from "expo-sqlite";
import type { StoragePort } from "@/domain/ports/storage.port";

const DB_NAME = "divvyup.db";

/**
 * Minimal on-device SQLite adapter for the Divvy Up shell.
 *
 * Opens the local database on mount and exposes a `clearAll` used by
 * `useAuth` on sign-out. The mature source app layered a full local-first
 * cache + sync queue on top of this; that surface is added per-milestone.
 */
export class SQLiteStorageAdapter implements StoragePort {
  private db: SQLite.SQLiteDatabase | null = null;

  async initialize(): Promise<void> {
    if (this.db) return;
    this.db = await SQLite.openDatabaseAsync(DB_NAME);
  }

  clearAll(): void {
    // Best-effort synchronous teardown: close the handle so the next
    // sign-in re-opens a fresh connection. Feature tables are dropped here
    // as they are added.
    try {
      this.db?.closeSync();
    } catch {
      // ignore — handle may already be closed
    }
    this.db = null;
  }
}
