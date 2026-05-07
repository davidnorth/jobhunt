CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT,
  status TEXT NOT NULL DEFAULT 'running',  -- running, completed, failed
  jobs_found INTEGER DEFAULT 0,
  jobs_scored INTEGER DEFAULT 0,
  error TEXT
);

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL REFERENCES runs(id),
  source TEXT NOT NULL,        -- indeed, linkedin, etc.
  source_id TEXT,              -- ID from the source platform
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  location TEXT,
  url TEXT,
  description TEXT,
  snippet TEXT,
  score INTEGER,               -- 0-100 fit score
  reasoning TEXT,              -- LLM reasoning
  strengths TEXT,              -- JSON array of strengths
  gaps TEXT,                   -- JSON array of gaps
  recommendation TEXT,         -- apply, consider, skip
  status TEXT NOT NULL DEFAULT 'new',  -- new, viewed, applied, rejected, archived
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_jobs_run ON jobs(run_id);
CREATE INDEX IF NOT EXISTS idx_jobs_score ON jobs(score DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_source_id ON jobs(source, source_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_dedup ON jobs(source, COALESCE(source_id, ''), title, company);
