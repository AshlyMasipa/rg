import { drizzle } from "drizzle-orm/better-sqlite3";
import type BetterSqlite3 from "better-sqlite3";
import { config } from "../config";
import * as schema from "./schema";
import { SqliteDatabase } from "./sqlite";

/**
 * Node's built-in SQLite behind a better-sqlite3-shaped wrapper (see ./sqlite.ts),
 * so Drizzle's better-sqlite3 driver works with no native addon to install.
 */
export const sqlite = new SqliteDatabase(config.dbPath);
if (config.dbPath !== ":memory:") sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
sqlite.exec(schema.DDL);

export const db = drizzle(sqlite as unknown as BetterSqlite3.Database, { schema });
export type Db = typeof db;
/** A transaction handle or the db itself — helpers accept either. */
export type DbLike = Pick<Db, "select" | "insert" | "update" | "delete">;
export { schema };
