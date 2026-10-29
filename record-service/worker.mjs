import {validateRecords} from "../record-utils.mjs";

const SESSION_LIFETIME = 24 * 60 * 60 * 1000;
const LOGIN_WINDOW = 15 * 60 * 1000;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const encoder = new TextEncoder();

class APIError extends Error {
  constructor(status, message, details = {}) { super(message); this.status = status; this.details = details; }
}
function json(data, status = 200) {
  return Response.json(data, {status, headers: {"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"}});
}
async function digest(value) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))), byte => byte.toString(16).padStart(2, "0")).join("");
}
async function equalSecret(left, right) {
  const a = await digest(left), b = await digest(right);
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}
async function bodyJSON(request) {
  if (!request.headers.get("Content-Type")?.startsWith("application/json")) throw new APIError(415, "Submit changes as JSON.");
  const reader = request.body?.getReader();
  if (!reader) throw new APIError(400, "The request is empty.");
  const chunks = []; let size = 0;
  for (;;) {
    const {value, done} = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) { await reader.cancel(); throw new APIError(413, "The collection is too large."); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new APIError(400, "Invalid request."); }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map(value => value.trim()).filter(Boolean);
    if ((origin && !allowed.includes(origin)) || (!origin && request.method !== "GET")) {
      return json({error: "This website is not allowed to access the collection."}, 403);
    }
    const cors = {"Vary": "Origin"};
    if (origin) cors["Access-Control-Allow-Origin"] = origin;
    cors["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS";
    cors["Access-Control-Allow-Headers"] = "Content-Type, Authorization";
    cors["Access-Control-Max-Age"] = "600";
    if (request.method === "OPTIONS") return new Response(null, {status: 204, headers: cors});
    let response;
    try {
      if (!env.CABINET || !/^\d{6}$/.test(env.CABINET_PIN || "")) throw new Error("Service configuration missing");
      const cabinet = env.CABINET.get(env.CABINET.idFromName("record-cabinet"));
      response = await cabinet.fetch(request);
    } catch {
      response = json({error: "The collection is unavailable. Try again."}, 503);
    }
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(cors)) headers.set(key, value);
    return new Response(response.body, {status: response.status, headers});
  }
};

// A single SQLite-backed Durable Object keeps all edits strongly ordered.
// The PIN is a Worker secret; neither the PIN nor raw session tokens are stored here.
export class RecordCabinet {
  constructor(ctx, env) { this.storage = ctx.storage; this.env = env; this.queue = Promise.resolve(); }
  fetch(request) {
    const task = this.queue.then(() => this.handle(request));
    this.queue = task.catch(() => {});
    return task;
  }
  async snapshot() { return await this.storage.get("library") || {records: null, revision: 0}; }
  async authenticate(request) {
    const token = request.headers.get("Authorization")?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    const key = token ? `session:${await digest(token)}` : "";
    const session = key ? await this.storage.get(key) : null;
    if (!session || session.expiresAt <= Date.now()) {
      if (session) await this.storage.delete(key);
      throw new APIError(401, "Editing is locked. Enter your PIN again.");
    }
    return key;
  }
  async login(request) {
    const now = Date.now();
    const ip = request.headers.get("CF-Connecting-IP") || "local";
    const key = `login:${await digest(ip)}`;
    let limit = await this.storage.get(key);
    if (!limit || limit.expiresAt <= now) limit = {attempts: 0, expiresAt: now + LOGIN_WINDOW};
    if (limit.attempts >= 5) throw new APIError(429, "Too many attempts. Try again in 15 minutes.");
    const data = await bodyJSON(request);
    // Count every attempt before comparison so parallel requests cannot bypass the limit.
    limit.attempts++; await this.storage.put(key, limit);
    await this.storage.setAlarm(now + LOGIN_WINDOW);
    if (typeof data.pin !== "string" || !/^\d{6}$/.test(data.pin) || !await equalSecret(data.pin, this.env.CABINET_PIN)) {
      throw new APIError(401, "Incorrect PIN. Try again.");
    }
    await this.storage.delete(key);
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, "0")).join("");
    await this.storage.put(`session:${await digest(token)}`, {expiresAt: now + SESSION_LIFETIME});
    return json({...await this.snapshot(), token});
  }
  async handle(request) {
    try {
      const url = new URL(request.url);
      if (url.pathname === "/records" && request.method === "GET") return json(await this.snapshot());
      if (url.pathname === "/session" && request.method === "POST") return await this.login(request);
      const key = await this.authenticate(request);
      if (url.pathname === "/session" && request.method === "DELETE") {
        await this.storage.delete(key); return json({locked: true});
      }
      if (url.pathname === "/records" && request.method === "PUT") {
        const data = await bodyJSON(request);
        const snapshot = await this.snapshot();
        if (!Number.isSafeInteger(data.revision) || data.revision !== snapshot.revision) {
          throw new APIError(409, "The collection changed in another tab. Try again with the updated list.", {snapshot});
        }
        let records;
        try { records = validateRecords(data.records); } catch (error) { throw new APIError(400, error.message); }
        const next = {records, revision: snapshot.revision + 1};
        await this.storage.put("library", next); return json(next);
      }
      throw new APIError(404, "This action was not found.");
    } catch (error) {
      return json({error: error instanceof APIError ? error.message : "Something went wrong. Try again.", ...error.details}, error.status || 500);
    }
  }
  async alarm() {
    const now = Date.now(); let next = Infinity;
    for (const prefix of ["session:", "login:"]) {
      const entries = await this.storage.list({prefix});
      for (const [key, value] of entries) {
        if (value.expiresAt <= now) await this.storage.delete(key);
        else next = Math.min(next, value.expiresAt);
      }
    }
    if (Number.isFinite(next)) await this.storage.setAlarm(next);
  }
}
