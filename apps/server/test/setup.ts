// Runs before any server module is imported in each test file.
process.env.DB_PATH = ":memory:";
process.env.TRACE_PACE_MS = "0";
process.env.AI_MODE = "mock";
process.env.LOG_LEVEL = "silent";
