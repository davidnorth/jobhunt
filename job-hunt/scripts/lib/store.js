import Database from "better-sqlite3";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const DB_PATH = path.resolve(ROOT, "database/jobhunt.db");
const SCHEMA_PATH = path.resolve(ROOT, "database/schema.sql");

let db;

export function getDb() {
  if (!db) {
    const dir = path.dirname(DB_PATH);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    const schema = readFileSync(SCHEMA_PATH, "utf8");
    db.exec(schema);
  }
  return db;
}

export function createRun() {
  const db = getDb();
  const stmt = db.prepare("INSERT INTO runs (status) VALUES ('running')");
  const result = stmt.run();
  return result.lastInsertRowid;
}

export function completeRun(runId, { jobsFound, jobsScored }) {
  const db = getDb();
  db.prepare(
    "UPDATE runs SET status = 'completed', finished_at = datetime('now'), jobs_found = ?, jobs_scored = ? WHERE id = ?"
  ).run(jobsFound, jobsScored, runId);
}

export function failRun(runId, error) {
  const db = getDb();
  db.prepare(
    "UPDATE runs SET status = 'failed', finished_at = datetime('now'), error = ? WHERE id = ?"
  ).run(String(error).slice(0, 1000), runId);
}

export function insertJob(job) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO jobs (run_id, source, source_id, title, company, location, url, description, snippet, score, reasoning, strengths, gaps, recommendation)
    VALUES (@run_id, @source, @source_id, @title, @company, @location, @url, @description, @snippet, @score, @reasoning, @strengths, @gaps, @recommendation)
  `);
  return stmt.run({
    run_id: job.runId,
    source: job.source,
    source_id: job.sourceId || null,
    title: job.title,
    company: job.company,
    location: job.location || null,
    url: job.url || null,
    description: job.description || null,
    snippet: job.snippet || null,
    score: job.score !== undefined ? job.score : null,
    reasoning: job.reasoning || null,
    strengths: job.strengths ? JSON.stringify(job.strengths) : null,
    gaps: job.gaps ? JSON.stringify(job.gaps) : null,
    recommendation: job.recommendation || null,
  });
}

export function getJobs({ minScore, status, limit, offset } = {}) {
  const db = getDb();
  const conditions = [];
  const params = {};

  if (minScore !== undefined) {
    conditions.push("j.score >= @minScore");
    params.minScore = minScore;
  }
  if (status) {
    conditions.push("j.status = @status");
    params.status = status;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = db
    .prepare(
      `SELECT j.*, r.started_at as run_date
       FROM jobs j
       JOIN runs r ON j.run_id = r.id
       ${where}
       ORDER BY COALESCE(j.score, 0) DESC, j.created_at DESC
       LIMIT @limit OFFSET @offset`
    )
    .all({
      ...params,
      limit: limit || 100,
      offset: offset || 0,
    });

  return rows.map(hydrateJsonFields);
}

export function getJob(id) {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT j.*, r.started_at as run_date
       FROM jobs j
       JOIN runs r ON j.run_id = r.id
       WHERE j.id = @id`
    )
    .get({ id });
  return row ? hydrateJsonFields(row) : null;
}

export function updateJobStatus(id, status) {
  const db = getDb();
  db.prepare("UPDATE jobs SET status = @status WHERE id = @id").run({ id, status });
}

export function getRuns({ limit, offset } = {}) {
  const db = getDb();
  return db
    .prepare(
      `SELECT r.*, (SELECT COUNT(*) FROM jobs WHERE run_id = r.id) as job_count
       FROM runs r
       ORDER BY r.started_at DESC
       LIMIT @limit OFFSET @offset`
    )
    .all({
      limit: limit || 50,
      offset: offset || 0,
    });
}

export function getRun(id) {
  const db = getDb();
  return db.prepare("SELECT * FROM runs WHERE id = @id").get({ id });
}

export function getLatestRun() {
  const db = getDb();
  return db
    .prepare("SELECT * FROM runs WHERE status = 'completed' ORDER BY started_at DESC LIMIT 1")
    .get();
}

export function getStats() {
  const db = getDb();
  const total = db.prepare("SELECT COUNT(*) as count FROM jobs").get();
  const scored = db.prepare("SELECT COUNT(*) as count FROM jobs WHERE score IS NOT NULL").get();
  const strongMatches = db.prepare("SELECT COUNT(*) as count FROM jobs WHERE score >= 70").get();
  const applied = db.prepare("SELECT COUNT(*) as count FROM jobs WHERE status = 'applied'").get();
  const latestRun = db.prepare(
    "SELECT * FROM runs WHERE status = 'completed' ORDER BY started_at DESC LIMIT 1"
  ).get();

  return {
    totalJobs: total.count,
    scoredJobs: scored.count,
    strongMatches: strongMatches.count,
    appliedCount: applied.count,
    latestRun,
  };
}

export function getLatestJobs(limit = 10) {
  return getJobs({ limit });
}

export function isJobSeen(source, sourceId, title, company) {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT id FROM jobs WHERE source = @source AND ((source_id IS NOT NULL AND source_id = @sourceId) OR (title = @title AND company = @company))"
    )
    .get({ source, sourceId: sourceId || null, title, company });
  return !!row;
}

function hydrateJsonFields(row) {
  if (!row) return row;
  return {
    ...row,
    strengths: row.strengths ? safeParse(row.strengths) : null,
    gaps: row.gaps ? safeParse(row.gaps) : null,
  };
}

function safeParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}
