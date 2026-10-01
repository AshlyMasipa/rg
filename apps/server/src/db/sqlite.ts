/**
 * Minimal better-sqlite3-compatible wrapper around Node's BUILT-IN SQLite
 * (`node:sqlite`, Node 22.13+ / 23.4+ with no flag).
 *
 * Why: better-sqlite3 is a native addon, and its prebuilt binary crashes
 * silently on some Windows setups / Node versions (e.g. Node 23). node:sqlite
 * ships inside Node itself, so there is nothing to compile or download.
 *
 * Drizzle's better-sqlite3 driver only uses: prepare() → run/all/get/raw(),
 * and transaction(fn).deferred/immediate/exclusive. That's all this implements.
 */
import { createRequire } from "node:module";

// node:sqlite prints an ExperimentalWarning on first use — silence just that one.
const originalEmitWarning = process.emitWarning.bind(process);
process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
  const text = typeof warning === "string" ? warning : warning?.message;
  if (text?.includes("SQLite is an experimental feature")) return;
  return (originalEmitWarning as (...a: unknown[]) => void)(warning, ...rest);
}) as typeof process.emitWarning;

// createRequire keeps bundlers/test runners from trying to resolve the builtin themselves.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");

type Params = unknown[];
type NodeStatement = ReturnType<InstanceType<typeof DatabaseSync>["prepare"]>;

class Statement {
  constructor(private readonly stmt: NodeStatement) {}

  run(...params: Params) {
    return this.stmt.run(...(params as never[]));
  }
  all(...params: Params) {
    return this.stmt.all(...(params as never[]));
  }
  get(...params: Params) {
    return this.stmt.get(...(params as never[]));
  }
  /** better-sqlite3's raw(): rows as arrays in column order. */
  raw() {
    const stmt = this.stmt as NodeStatement & { setReturnArrays?: (on: boolean) => void };
    const withArrays = <T>(fn: () => T): T => {
      if (typeof stmt.setReturnArrays === "function") {
        stmt.setReturnArrays(true);
        try { return fn(); } finally { stmt.setReturnArrays(false); }
      }
      return fn();
    };
    const toArray = (row: unknown) =>
      row == null || Array.isArray(row) ? row : Object.values(row as Record<string, unknown>);
    return {
      all: (...params: Params) => withArrays(() => this.stmt.all(...(params as never[]))).map(toArray),
      get: (...params: Params) => toArray(withArrays(() => this.stmt.get(...(params as never[])))),
    };
  }
}

export class SqliteDatabase {
  private readonly db: InstanceType<typeof DatabaseSync>;
  private inTransaction = false;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
  }

  prepare(sql: string) {
    return new Statement(this.db.prepare(sql));
  }

  exec(sql: string) {
    this.db.exec(sql);
    return this;
  }

  pragma(pragma: string) {
    this.db.exec(`PRAGMA ${pragma}`);
  }

  /** better-sqlite3 semantics: returns a function that runs `fn` inside BEGIN/COMMIT. */
  transaction<A extends unknown[], R>(fn: (...args: A) => R) {
    const wrap = (mode: "DEFERRED" | "IMMEDIATE" | "EXCLUSIVE") => (...args: A): R => {
      if (this.inTransaction) return fn(...args); // Drizzle handles nesting with savepoints itself
      this.db.exec(`BEGIN ${mode}`);
      this.inTransaction = true;
      try {
        const result = fn(...args);
        this.db.exec("COMMIT");
        return result;
      } catch (err) {
        this.db.exec("ROLLBACK");
        throw err;
      } finally {
        this.inTransaction = false;
      }
    };
    return Object.assign(wrap("DEFERRED"), {
      deferred: wrap("DEFERRED"),
      immediate: wrap("IMMEDIATE"),
      exclusive: wrap("EXCLUSIVE"),
    });
  }

  close() {
    this.db.close();
  }
}
