import http from "node:http";
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {webcrypto} from "node:crypto";
import worker, {RecordCabinet} from "../record-service/worker.mjs";
import {MemoryStorage} from "../tests/memory-storage.mjs";

// A disposable local preview. It never connects to or changes the live cabinet.
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const port = Number(process.env.PORT || 4173);
const root = fileURLToPath(new URL("../", import.meta.url));
const localOrigin = `http://127.0.0.1:${port}`;
const env = {CABINET_PIN: "123456", ALLOWED_ORIGINS: `${localOrigin},http://localhost:${port}`};
const cabinet = new RecordCabinet({storage: new MemoryStorage()}, env);
env.CABINET = {idFromName: value => value, get: () => cabinet};
const types = {".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".pdf": "application/pdf"};
http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, localOrigin);
    if (url.pathname.startsWith("/api/")) {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const request = new Request(`${localOrigin}${url.pathname.slice(4)}${url.search}`, {method: req.method, headers: req.headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks)});
      const response = await worker.fetch(request, env);
      res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer())); return;
    }
    if (url.pathname === "/record-config.js") {
      res.writeHead(200, {"Content-Type": "text/javascript", "Cache-Control": "no-store"});
      res.end(`window.roomRecordAPI = ${JSON.stringify(`${localOrigin}/api`)};`); return;
    }
    const filename = path.resolve(root, `.${decodeURIComponent(url.pathname === "/" ? "/misc.html" : url.pathname)}`);
    const relative = path.relative(root, filename);
    if (relative.startsWith("..") || path.isAbsolute(relative) || relative.split(path.sep).some(part => part.startsWith(".")) || /^(record-service|tests|scripts)(\\|\/)/.test(relative)) {
      res.writeHead(403); res.end("Forbidden"); return;
    }
    const content = await readFile(filename);
    res.writeHead(200, {"Content-Type": types[path.extname(filename)] || "application/octet-stream", "Cache-Control": "no-store"}); res.end(content);
  } catch { res.writeHead(404); res.end("Not found"); }
}).listen(port, "127.0.0.1", () => console.log(`Local preview: ${localOrigin}/misc.html (disposable cabinet, test PIN: 123456)`));
