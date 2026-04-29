# CV

Local, file-based CV generator. Edit markdown + CSS, get a clean HTML page. Print to PDF from your browser. No paid tools, no Tailwind.

## How it works

- **Content** lives in `content/<variant>.md` — markdown body for the summary, YAML frontmatter for structured data (name, contact, sections with experience/skills/etc).
- **Styling** lives in `styles/cv.css` — single file, edit freely.
- **Template** is `template.html` — placeholders filled by `scripts/render.js`.
- **Variants**: keep multiple files in `content/` (e.g. `default.md`, `frontend.md`, `management.md`) and pick by name on the CLI.

## Commands

Install once: `npm install`

```
npm run dev [variant]      # live-reload dev server at http://localhost:4321
npm run build [variant]    # writes dist/<variant>.html
```

`variant` defaults to `default` (i.e. `content/default.md`). The dev server watches the chosen content file plus `styles/` and `template.html` and reloads on change.

To produce a PDF, open the HTML in a browser and use Cmd+P → Save as PDF.

## Typical loop

1. `npm run dev frontend` — tweak content + CSS in the browser.
2. `npm run build frontend` — get `dist/frontend.html`, then print to PDF from the browser.

## Layout

```
content/        # one markdown file per CV variant
styles/cv.css   # all styling
template.html   # HTML shell
scripts/
  render.js     # md + frontmatter -> HTML
  dev.js        # http server + chokidar + ws live reload
  build.js      # render -> HTML
dist/           # build output (gitignored)
```

## Frontmatter shape

```yaml
---
name: David North
title: Software Engineer and Manager
contact: [you@example.com, "07xxx", Town]
sections:
  - type: experience
    title: Work Experience
    items:
      - company: Acme
        role: Senior Developer
        period: 2023 - 2025
        description: |
          Markdown body. Multiple paragraphs ok.
  - type: skills
    title: Skills
    items: [JavaScript, Ruby on Rails, CSS]
---

Markdown summary goes in the body, below the frontmatter.
```

Other section types: `list` (bulleted markdown items) and `prose` (free markdown body).
