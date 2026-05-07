# Job Hunt — Current State

AI-powered job discovery agent. Knows you from your CV variants + knowledge base, scrapes job boards, scores fits with Deepseek, serves a web dashboard. Candidate-first bias: evaluates whether a job suits YOU, not the other way around.

## What works

**Profile engine** (`scripts/lib/profile.js`)
- Reads all `cv-builder/content/*.md` — extracts skills, experience, roles from frontmatter
- Reads all `job-hunt/knowledge/*.md` — extracts preferences, dealbreakers, freeform prose
- Derives search terms from desiredRoles + core skills
- Passes everything as structured JSON to the LLM scorer

**Indeed scraper** (`scripts/lib/sources/indeed.js`)
- Playwright + stealth measures (anti-webdriver, real UA, viewport, locale) — gets past Cloudflare on search results
- 9 keyword-targeted searches per run (roles + core skills), 15 jobs per search
- Extracts: title, company, location, snippet/metadata, source ID
- Deduplication across search results within a run
- **Limitation**: Cannot fetch full job descriptions — Cloudflare blocks detail pages. Scoring relies on title + company + location only.

**Deepseek scorer** (`scripts/lib/scorer.js`)
- OpenAI-compatible API (`deepseek-chat` model)
- Candidate-first prompt: evaluates job suitability for the candidate's preferences, values, and dealbreakers
- Returns: score (0-100), reasoning, strengths, gaps, recommendation (apply/consider/skip)
- Dealbreakers from knowledge base are treated as hard passes
- ~75 jobs scored in ~3-4 minutes. API cost negligible (~$0.01/run)

**SQLite persistence** (`scripts/lib/store.js`, `database/schema.sql`)
- Tracks runs, jobs, scores, statuses
- Deduplication by source + source_id + title + company
- Status workflow: new → viewed → applied → rejected → archived

**Web dashboard** (`scripts/server.js`)
- Express server on port 4322
- Server-rendered HTML + vanilla CSS (no build step, no framework)
- Routes: Dashboard, Jobs (filterable), Reports, Profile
- "Run Now" button triggers a manual discovery + scoring run
- API: `POST /api/run`, `GET /api/jobs`, `GET /api/runs`

**Dev server** (`scripts/dev.js`)
- Live reload via WebSocket + chokidar
- Watches views, styles, scripts, knowledge directories

## What's next

### Phase 1 — better data
- [ ] **Job descriptions** — biggest gap. Without descriptions, scores lean conservative. Options:
  - Google Jobs API (returns descriptions, no anti-bot walls)
  - Indeed mobile endpoints (might have less protection)
  - LinkedIn (needs login but has descriptions)
  - Accept snippet-only and refine knowledge base to compensate
- [ ] **More sources** — Indeed alone is narrow. Google Jobs, LinkedIn, company career pages, RSS feeds.

### Phase 2 — automation
- [ ] **Scheduler** (`scripts/lib/scheduler.js` — stub exists). Run automatically daily, produce a summary.
- [ ] **Deduplication across runs** — avoid re-scoring the same job on subsequent days.
- [ ] **Diff reports** — what's new since last run?

### Phase 3 — application
- [ ] **CV tailoring** — reuse `cv-builder` renderer to generate role-specific CVs
- [ ] **Cover letter generation** — LLM writes a tailored cover letter using profile + job
- [ ] **Auto-apply** — Playwright fills application forms (needs careful design for liability)

### Phase 4 — polish
- [ ] **Search term tuning** — currently derived from roles + core skills. Some terms (e.g. "JavaScript" alone) return noisy results.
- [ ] **Scoring calibration** — adjust prompt over time as you review scores
- [ ] **Better UI filtering** — sort by score, date, source; batch actions

## How to run

```
cd job-hunt
echo 'DEEPSEEK_API_KEY=sk-...' > .env
npm install
npm run dev     # → http://localhost:4322
npm start       # production mode
```

## Layout

```
job-hunt/
  knowledge/profile.md     # your preferences (informal YAML frontmatter + prose)
  scripts/
    server.js              # Express web server + routes + HTML rendering
    dev.js                 # dev server with live reload
    lib/
      profile.js           # CV + knowledge → structured profile
      scorer.js            # Deepseek LLM job fit scorer
      store.js             # SQLite persistence
      scheduler.js         # stub — cron-like daily runner
      sources/
        indeed.js          # Playwright-based Indeed scraper
  styles/job-hunt.css      # all UI styling
  views/layout.html        # base HTML shell
  database/schema.sql      # runs + jobs tables
```

## Key design decisions

- **Candidate-first scoring** — evaluates job suitability for the candidate, not the reverse. Dealbreakers are hard passes (0-20).
- **Keyword-targeted search** — no brute-force scraping. Each search term gets its own targeted query. Indeed's own relevance ranking does the pre-filtering. Only results that make it past Indeed get scored.
- **No frontend framework** — server-rendered HTML + vanilla CSS, matching the `cv-builder` philosophy.
- **Deepseek over OpenAI** — cheaper, good enough reasoning, OpenAI-compatible API.
- **SQLite** — zero-config, single-file, perfect for a personal tool.
