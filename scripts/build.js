import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { renderHtml, resolveContentPath } from "./render.js";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

const args = process.argv.slice(2);
const name = args.find((a) => !a.startsWith("--")) || "default";

const contentPath = resolveContentPath(name);
const outDir = path.join(ROOT, "dist");
await mkdir(outDir, { recursive: true });

const html = await renderHtml(contentPath);
const htmlOut = path.join(outDir, `${name}.html`);
await writeFile(htmlOut, html, "utf8");
console.log(`Wrote ${path.relative(ROOT, htmlOut)}`);
