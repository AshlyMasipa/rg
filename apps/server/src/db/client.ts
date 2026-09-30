import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { config } from "../config";
import * as schema from "./schema";

export const sqlite = new Database(config.dbPath);
if (config.dbPath !== ":memory:") sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
sqlite.exec(schema.DDL);

export const db = drizzle(sqlite, { schema });
export type Db = typeof db;
/** A transaction handle or the db itself — helpers accept either. */
export type DbLike = Pick<Db, "select" | "insert" | "update" | "delete">;
export { schema };
