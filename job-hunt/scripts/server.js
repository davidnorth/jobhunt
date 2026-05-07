import express from "express";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { buildProfile } from "./lib/profile.js";
import { getStats, getJobs, getJob, getRuns, getRun, updateJobStatus } from "./lib/store.js";
import { runNow } from "./lib/scheduler.js";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const PORT = Number(process.env.PORT) || 4322;

export function createApp({ liveReload = false } = {}) {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  if (liveReload) {
    app.use((req, res, next) => {
      const _send = res.send.bind(res);
      res.send = function (body) {
        if (typeof body === "string" && body.includes("</body>")) {
          body = body.replace(
            "{{liveReload}}",
            `<script>(()=>{const w=new WebSocket("ws://"+location.host);w.onmessage=e=>{if(e.data==="reload")location.reload()}})()</script>`
          );
        }
        return _send(body);
      };
      next();
    });
  }

  let layoutCache = null;

  async function loadLayout() {
    if (!layoutCache) {
      const [html, css] = await Promise.all([
        readFile(path.join(ROOT, "views", "layout.html"), "utf8"),
        readFile(path.join(ROOT, "styles", "job-hunt.css"), "utf8"),
      ]);
      layoutCache = { html, css };
    }
    return layoutCache;
  }

  async function render(title, bodyHtml, activeNav = "") {
    const { html, css } = await loadLayout();
    return html
      .replace("{{title}}", esc(title))
      .replace("{{css}}", css)
      .replace("{{content}}", bodyHtml)
      .replace("{{activeDashboard}}", activeNav === "dashboard" ? "active" : "")
      .replace("{{activeJobs}}", activeNav === "jobs" ? "active" : "")
      .replace("{{activeReports}}", activeNav === "reports" ? "active" : "")
      .replace("{{activeProfile}}", activeNav === "profile" ? "active" : "")
      .replace("{{liveReload}}", "");
  }

  app.get("/", async (_req, res) => {
    try {
      const stats = getStats();
      const topJobs = getJobs({ minScore: 50, limit: 5 });
      const html = await render("Dashboard", dashboardHtml(stats, topJobs), "dashboard");
      res.send(html);
    } catch (err) {
      res.status(500).send(errorHtml(err));
    }
  });

  app.get("/jobs", async (req, res) => {
    try {
      const minScore = req.query.minScore ? Number(req.query.minScore) : undefined;
      const status = req.query.status || undefined;
      const jobs = getJobs({ minScore, status, limit: 200 });
      const html = await render("Jobs", jobsHtml(jobs, { minScore, status }), "jobs");
      res.send(html);
    } catch (err) {
      res.status(500).send(errorHtml(err));
    }
  });

  app.get("/jobs/:id", async (req, res) => {
    try {
      const job = getJob(Number(req.params.id));
      if (!job) return res.status(404).send(await render("Not Found", "<p>Job not found</p>"));
      const html = await render(
        `${job.title} at ${job.company}`,
        jobDetailHtml(job),
        "jobs"
      );
      res.send(html);
    } catch (err) {
      res.status(500).send(errorHtml(err));
    }
  });

  app.post("/jobs/:id/status", async (req, res) => {
    try {
      const { status } = req.body;
      if (!["new", "viewed", "applied", "rejected", "archived"].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }
      updateJobStatus(Number(req.params.id), status);
      res.redirect(`/jobs/${req.params.id}`);
    } catch (err) {
      res.status(500).send(errorHtml(err));
    }
  });

  app.get("/reports", async (_req, res) => {
    try {
      const runs = getRuns({ limit: 50 });
      const html = await render("Reports", reportsHtml(runs), "reports");
      res.send(html);
    } catch (err) {
      res.status(500).send(errorHtml(err));
    }
  });

  app.get("/reports/:id", async (req, res) => {
    try {
      const run = getRun(Number(req.params.id));
      if (!run) return res.status(404).send(await render("Not Found", "<p>Report not found</p>"));
      const jobs = getJobs({ limit: 500 }).filter(
        (j) => String(j.run_id) === String(run.id)
      );
      const html = await render(
        `Report #${run.id}`,
        reportDetailHtml(run, jobs),
        "reports"
      );
      res.send(html);
    } catch (err) {
      res.status(500).send(errorHtml(err));
    }
  });

  app.get("/profile", async (_req, res) => {
    try {
      const profile = await buildProfile();
      const html = await render("Your Profile", profileHtml(profile), "profile");
      res.send(html);
    } catch (err) {
      res.status(500).send(errorHtml(err));
    }
  });

  app.post("/api/run", async (_req, res) => {
    try {
      const result = await runNow();
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err.message || err) });
    }
  });

  app.get("/api/runs", (_req, res) => {
    const runs = getRuns({ limit: 20 });
    res.json(runs);
  });

  app.get("/api/jobs", (req, res) => {
    const minScore = req.query.minScore ? Number(req.query.minScore) : undefined;
    const status = req.query.status || undefined;
    const jobs = getJobs({ minScore, status, limit: 200 });
    res.json(jobs);
  });

  return app;
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function errorHtml(err) {
  return `<div class="error"><h2>Error</h2><pre>${esc(String(err.stack || err))}</pre></div>`;
}

function scoreBadge(score) {
  if (score === null || score === undefined) return `<span class="badge badge--none">—</span>`;
  if (score >= 80) return `<span class="badge badge--high">${score}</span>`;
  if (score >= 60) return `<span class="badge badge--medium">${score}</span>`;
  return `<span class="badge badge--low">${score}</span>`;
}

function statusLabel(s) {
  const labels = {
    new: "New",
    viewed: "Viewed",
    applied: "Applied",
    rejected: "Rejected",
    archived: "Archived",
  };
  return `status-${s || "new"}`;
}

// ---- Dashboard Page ----

function dashboardHtml(stats, topJobs) {
  const lastRun = stats.latestRun
    ? `<p>Last run: <strong>${stats.latestRun.started_at}</strong> &mdash; found ${stats.latestRun.jobs_found} jobs, scored ${stats.latestRun.jobs_scored}</p>`
    : "<p>No runs yet. <a href=\"#\" onclick=\"fetch('/api/run',{method:'POST'}).then(r=>r.json()).then(d=>location.reload()).catch(e=>alert(e))\">Run now</a></p>";

  return `
  <div class="dashboard">
    <div class="dashboard-header">
      <h1>Dashboard</h1>
      <form action="/api/run" method="POST" onsubmit="event.preventDefault();fetch('/api/run',{method:'POST'}).then(r=>r.json()).then(d=>location.reload()).catch(e=>alert(e.message||e))">
        <button class="btn btn--primary" type="submit">Run Now</button>
      </form>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${stats.totalJobs}</div>
        <div class="stat-label">Jobs found</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.scoredJobs}</div>
        <div class="stat-label">Scored</div>
      </div>
      <div class="stat-card stat-card--highlight">
        <div class="stat-value">${stats.strongMatches}</div>
        <div class="stat-label">Strong matches (70+)</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.appliedCount}</div>
        <div class="stat-label">Applied</div>
      </div>
    </div>

    <div class="last-run">
      ${lastRun}
    </div>

    <h2>Top Matches</h2>
    ${topJobs.length === 0 ? "<p>No matches yet. Run a discovery to find jobs.</p>" : jobTableHtml(topJobs)}
  </div>`;
}

// ---- Jobs Page ----

function jobsHtml(jobs, filters) {
  const minScore = filters.minScore || 0;
  const statusFilter = filters.status || "";

  return `
  <div class="jobs-page">
    <h1>Jobs</h1>
    <form class="filters" action="/jobs" method="GET">
      <label>
        Min score:
        <input type="number" name="minScore" value="${minScore}" min="0" max="100" style="width:70px" />
      </label>
      <label>
        Status:
        <select name="status">
          <option value="">All</option>
          <option value="new" ${statusFilter === "new" ? "selected" : ""}>New</option>
          <option value="viewed" ${statusFilter === "viewed" ? "selected" : ""}>Viewed</option>
          <option value="applied" ${statusFilter === "applied" ? "selected" : ""}>Applied</option>
          <option value="rejected" ${statusFilter === "rejected" ? "selected" : ""}>Rejected</option>
          <option value="archived" ${statusFilter === "archived" ? "selected" : ""}>Archived</option>
        </select>
      </label>
      <button class="btn btn--secondary" type="submit">Filter</button>
    </form>

    <p class="count">${jobs.length} jobs found</p>
    ${jobs.length === 0 ? "<p>No jobs match. Try adjusting filters or running a discovery.</p>" : jobTableHtml(jobs)}
  </div>`;
}

function jobTableHtml(jobs) {
  const rows = jobs.map((j) => `
    <tr class="${statusLabel(j.status)}">
      <td>${scoreBadge(j.score)}</td>
      <td><a href="/jobs/${j.id}">${esc(j.title)}</a></td>
      <td>${esc(j.company)}</td>
      <td>${esc(j.location || "—")}</td>
      <td>${esc(j.source || "—")}</td>
      <td>${esc(j.recommendation || "—")}</td>
      <td>${esc(statusLabel(j.status))}</td>
      <td class="date">${esc(j.run_date || "—")}</td>
    </tr>
  `).join("");

  return `
  <table class="job-table">
    <thead>
      <tr>
        <th>Score</th>
        <th>Title</th>
        <th>Company</th>
        <th>Location</th>
        <th>Source</th>
        <th>Rec</th>
        <th>Status</th>
        <th>Date</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

// ---- Job Detail ----

function jobDetailHtml(job) {
  const strengths = (job.strengths || []).map((s) => `<li>${esc(s)}</li>`).join("");
  const gaps = (job.gaps || []).map((g) => `<li>${esc(g)}</li>`).join("");

  return `
  <div class="job-detail">
    <div class="job-detail-header">
      <div>
        <h1>${esc(job.title)}</h1>
        <p class="company">${esc(job.company)}${job.location ? ` &middot; ${esc(job.location)}` : ""}</p>
        ${job.url ? `<p><a href="${esc(job.url)}" target="_blank" rel="noopener">View original listing &rarr;</a></p>` : ""}
      </div>
      <div class="job-detail-score">${scoreBadge(job.score)}</div>
    </div>

    <div class="job-detail-meta">
      <span>Recommendation: <strong>${esc(job.recommendation || "—")}</strong></span>
      <span>Status: <strong>${esc(statusLabel(job.status))}</strong></span>
      <span>Source: <strong>${esc(job.source || "—")}</strong></span>
      <span>Found: <strong>${esc(job.run_date || "—")}</strong></span>
      ${job.source_id ? `<span>Source ID: <strong>${esc(job.source_id)}</strong></span>` : ""}
    </div>

    ${job.reasoning ? `<div class="reasoning"><h2>Reasoning</h2><p>${esc(job.reasoning)}</p></div>` : ""}

    ${strengths ? `<div class="strengths"><h2>Strengths</h2><ul>${strengths}</ul></div>` : ""}
    ${gaps ? `<div class="gaps"><h2>Gaps</h2><ul>${gaps}</ul></div>` : ""}

    ${job.description ? `
    <div class="job-description">
      <h2>Job Description</h2>
      <pre>${esc(job.description.slice(0, 5000))}${job.description.length > 5000 ? "..." : ""}</pre>
    </div>` : ""}

    <div class="job-actions">
      <h2>Update Status</h2>
      <form action="/jobs/${job.id}/status" method="POST" class="status-form">
        <input type="hidden" name="id" value="${job.id}" />
        ${["viewed", "applied", "rejected", "archived"].map((s) =>
          `<button class="btn btn--small ${job.status === s ? "btn--active" : ""}" name="status" value="${s}">${s.charAt(0).toUpperCase() + s.slice(1)}</button>`
        ).join("")}
      </form>
    </div>
  </div>`;
}

// ---- Reports Page ----

function reportsHtml(runs) {
  if (runs.length === 0) return `<div class="reports"><h1>Reports</h1><p>No runs yet.</p></div>`;

  const rows = runs.map((r) => `
    <tr>
      <td><a href="/reports/${r.id}">#${r.id}</a></td>
      <td>${esc(r.started_at || "—")}</td>
      <td>${esc(r.finished_at || "—")}</td>
      <td>${esc(r.status)}</td>
      <td>${r.jobs_found}</td>
      <td>${r.jobs_scored}</td>
      <td>${r.job_count}</td>
    </tr>
  `).join("");

  return `
  <div class="reports">
    <h1>Reports</h1>
    <table class="job-table">
      <thead>
        <tr>
          <th>Run</th>
          <th>Started</th>
          <th>Finished</th>
          <th>Status</th>
          <th>Found</th>
          <th>Scored</th>
          <th>Stored</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

// ---- Report Detail ----

function reportDetailHtml(run, jobs) {
  return `
  <div class="report-detail">
    <h1>Report #${run.id}</h1>
    <div class="report-meta">
      <p>Started: <strong>${esc(run.started_at)}</strong></p>
      <p>Finished: <strong>${esc(run.finished_at || "—")}</strong></p>
      <p>Status: <strong>${esc(run.status)}</strong></p>
      <p>Jobs found: <strong>${run.jobs_found}</strong></p>
      <p>Jobs scored: <strong>${run.jobs_scored}</strong></p>
      ${run.error ? `<p class="error">Error: ${esc(run.error)}</p>` : ""}
    </div>
    <h2>Jobs in this run</h2>
    ${jobs.length === 0 ? "<p>No jobs in this run.</p>" : jobTableHtml(jobs)}
  </div>`;
}

// ---- Profile Page ----

function profileHtml(profile) {
  const skills = (profile.skills || []).map((s) => `<li>${esc(s)}</li>`).join("");
  const experience = (profile.experience || []).map((e) => `
    <div class="exp-item">
      <h3>${esc(e.role)} &mdash; ${esc(e.company)}</h3>
      <p class="period">${esc(e.period)}</p>
      <pre class="exp-desc">${esc(e.description.slice(0, 500))}</pre>
    </div>
  `).join("");

  const preferences = profile.preferences ? Object.entries(profile.preferences).map(([k, v]) => `
    <div class="pref-item">
      <strong>${esc(k)}:</strong>
      <span>${esc(typeof v === "string" ? v : JSON.stringify(v))}</span>
    </div>
  `).join("") : "<p>No preferences configured. Add them in knowledge/*.md</p>";

  return `
  <div class="profile-page">
    <h1>Your Profile</h1>
    <p class="subtitle">Aggregated from all CV variants and knowledge files</p>

    <div class="profile-section">
      <h2>Basics</h2>
      <p><strong>Name:</strong> ${esc(profile.name)}</p>
      <p><strong>Title:</strong> ${esc(profile.title)}</p>
      <p><strong>Contact:</strong> ${(profile.contact || []).map(esc).join(" &middot; ")}</p>
      ${profile.summary ? `<p><strong>Summary:</strong> ${esc(profile.summary.slice(0, 500))}</p>` : ""}
    </div>

    <div class="profile-section">
      <h2>Skills (${profile.skills?.length || 0})</h2>
      <ul class="skill-list">${skills}</ul>
    </div>

    <div class="profile-section">
      <h2>Experience (${profile.experience?.length || 0} roles)</h2>
      ${experience}
    </div>

    <div class="profile-section">
      <h2>Preferences</h2>
      ${preferences}
    </div>

    ${profile.knowledgeRaw ? `
    <div class="profile-section">
      <h2>Knowledge Base (raw)</h2>
      <pre class="knowledge-raw">${esc(profile.knowledgeRaw.slice(0, 2000))}</pre>
    </div>` : ""}
  </div>`;
}

// Start server if run directly
const isDirect =
  process.argv[1] &&
  (process.argv[1].endsWith("/server.js") || process.argv[1].endsWith("\\server.js"));

if (isDirect) {
  const app = createApp();
  app.listen(PORT, () => {
    console.log(`Job Hunt: http://localhost:${PORT}`);
  });
}
