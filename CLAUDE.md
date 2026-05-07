# CV Monorepo

Two local tools: a CV generator and an AI-powered job discovery agent.

## cv-builder

File-based CV generator. Edit markdown + CSS, get a clean HTML page. Print to PDF from your browser.

```
cd cv-builder
npm install
npm run dev [variant]    # live-reload at http://localhost:4321
npm run build [variant]  # writes dist/<variant>.html
```

`variant` defaults to `default` (i.e. `content/default.md`).

To produce a PDF, open the HTML in a browser and use Cmd+P → Save as PDF.

## job-hunt

AI-powered job discovery. Aggregates your CV data + knowledge base, scrapes job boards, scores fits with an LLM, and serves a web dashboard.

```
cd job-hunt
npm install
npm run dev    # dev server at http://localhost:4322
npm start      # production server at http://localhost:4322
```

Set `DEEPSEEK_API_KEY` in `job-hunt/.env` before running.

### How it works

1. **Profile engine** reads all `cv-builder/content/*.md` (extracting skills, experience, roles) and `job-hunt/knowledge/*.md` (your preferences: desired role, salary, location, etc.) and builds a structured JSON profile.
2. **Job discovery** scrapes Indeed (and later LinkedIn) for matching roles.
3. **AI scoring** sends each job + your profile to Deepseek for a 0-100 fit score with reasoning.
4. **Dashboard** — a web UI at localhost:4322 to browse matches, view reports, and trigger runs.

### Layout

```
cv-builder/         # CV generator
  content/*.md      # CV variants (also used by job-hunt for profile)
  styles/cv.css
  template.html
  scripts/
    render.js
    dev.js
    build.js

job-hunt/           # AI job discovery
  knowledge/        # your preferences in markdown
    profile.md
  scripts/
    server.js       # Express web server
    dev.js          # dev server with live reload
    lib/
      profile.js    # CV + knowledge → structured profile
      scorer.js     # Deepseek LLM job fit scorer
      store.js      # SQLite persistence
      scheduler.js  # cron-like daily runner
      sources/
        indeed.js   # Playwright-based Indeed scraper
  styles/
    job-hunt.css
  views/            # server-rendered HTML
    layout.html
    dashboard.html
    jobs.html
    report.html
    profile.html
  database/
    schema.sql
```
