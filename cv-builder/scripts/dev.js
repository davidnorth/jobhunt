import http from "node:http";
import path from "node:path";
import chokidar from "chokidar";
import { WebSocketServer } from "ws";
import { renderHtml, resolveContentPath } from "./render.js";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const name = process.argv[2] || "default";
const port = Number(process.env.PORT) || 4321;

const contentPath = resolveContentPath(name);

const server = http.createServer(async (req, res) => {
  try {
    const html = await renderHtml(contentPath, { liveReload: true });
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end(String(err.stack || err));
  }
});

const wss = new WebSocketServer({ server });
const broadcast = (msg) => wss.clients.forEach((c) => c.readyState === 1 && c.send(msg));

const watcher = chokidar.watch(
  [contentPath, path.join(ROOT, "styles"), path.join(ROOT, "template.html")],
  { ignoreInitial: true }
);
watcher.on("all", (evt, p) => {
  console.log(`[reload] ${evt} ${path.relative(ROOT, p)}`);
  broadcast("reload");
});

server.listen(port, () => {
  console.log(`CV dev server: http://localhost:${port}`);
  console.log(`Editing: ${path.relative(ROOT, contentPath)}`);
});
