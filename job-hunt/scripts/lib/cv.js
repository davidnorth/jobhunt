import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { marked } from "marked";

const CV_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

const md = (s) => (s ? marked.parse(String(s).trim()) : "");
const mdInline = (s) => (s ? marked.parseInline(String(s).trim()) : "");
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export async function listVariants() {
  const files = await readdir(path.join(CV_ROOT, "cv", "content"));
  return files
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""));
}

export function resolveContentPath(name) {
  const candidates = [
    path.join(CV_ROOT, "cv", "content", `${name}.md`),
    path.join(CV_ROOT, "cv", "content", name),
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  throw new Error(`CV variant not found: ${name}`);
}

export async function renderCv(name) {
  const contentPath = resolveContentPath(name);
  const [raw, css, template] = await Promise.all([
    readFile(contentPath, "utf8"),
    readFile(path.join(CV_ROOT, "cv", "cv.css"), "utf8"),
    readFile(path.join(CV_ROOT, "cv", "template.html"), "utf8"),
  ]);

  const { data, content } = matter(raw);
  const summary = md(content);

  const contact = (data.contact || [])
    .map((c) => `<span>${esc(c)}</span>`)
    .join('<span class="sep">|</span>');

  const sections = (data.sections || []).map((s) => {
    if (s.type === "experience") {
      const items = (s.items || [])
        .map(
          (it) => `
        <article class="job">
          <header>
            <h3>${esc(it.company)} <span class="period">${esc(it.period || "")}</span></h3>
            <p class="role">${esc(it.role || "")}</p>
          </header>
          <div class="job-body">${md(it.description)}</div>
        </article>`
        )
        .join("");
      return `<section class="section section--experience">
        <h2>${esc(s.title || "Experience")}</h2>
        ${items}
      </section>`;
    }
    if (s.type === "skills") {
      const items = (s.items || []).map((sk) => `<li>${esc(sk)}</li>`).join("");
      return `<section class="section section--skills">
        <h2>${esc(s.title || "Skills")}</h2>
        <ul class="skills-grid">${items}</ul>
      </section>`;
    }
    if (s.type === "list") {
      const items = (s.items || []).map((i) => `<li>${mdInline(i)}</li>`).join("");
      return `<section class="section">
        <h2>${esc(s.title)}</h2>
        <ul>${items}</ul>
      </section>`;
    }
    if (s.type === "prose") {
      return `<section class="section">
        <h2>${esc(s.title)}</h2>
        ${md(s.body)}
      </section>`;
    }
    return "";
  }).join("\n");

  return template
    .replace("{{title}}", esc(`${data.name || "CV"} — ${name}`))
    .replace("{{css}}", css)
    .replace("{{name}}", esc(data.name || ""))
    .replace("{{tagline}}", esc(data.title || ""))
    .replace("{{contact}}", contact)
    .replace("{{summary}}", summary)
    .replace("{{sections}}", sections)
    .replace("{{liveReload}}", "");
}
