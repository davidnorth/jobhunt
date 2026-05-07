import http from "node:http";
import path from "node:path";
import chokidar from "chokidar";
import { WebSocketServer } from "ws";
import { createApp } from "./server.js";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const CV_ROOT = path.join(ROOT, "cv");
const PORT = Number(process.env.PORT) || 4322;

const app = createApp({ liveReload: true });
const server = http.createServer(app);

const wss = new WebSocketServer({ server });
const broadcast = (msg) => {
  for (const c of wss.clients) {
    if (c.readyState === 1) c.send(msg);
  }
};

const watched = [
  path.join(ROOT, "views"),
  path.join(ROOT, "styles"),
  path.join(ROOT, "scripts"),
  path.join(ROOT, "knowledge"),
  path.join(CV_ROOT, "content"),
  path.join(CV_ROOT, "cv.css"),
  path.join(CV_ROOT, "template.html"),
];

const watcher = chokidar.watch(watched, { ignoreInitial: true });
watcher.on("all", (evt, p) => {
  console.log(`[reload] ${evt} ${path.relative(ROOT, p)}`);
  broadcast("reload");
});

server.listen(PORT, () => {
  console.log(`Job Hunt dev: http://localhost:${PORT}`);
  console.log(`Watching for changes...`);
});
