import {readFile} from "node:fs/promises";
import vm from "node:vm";
import assert from "node:assert/strict";

// Read the PIN through stdin; never print or save it.
process.stdout.write("Enter the cabinet PIN through stdin to verify the deployed service.\n");
let pin = "";
if (process.stdin.isTTY) process.stdin.setRawMode(true);
for await (const chunk of process.stdin) { pin += chunk; if (/[\r\n]/.test(pin)) break; }
if (process.stdin.isTTY) process.stdin.setRawMode(false);
process.stdin.pause();
process.stdin.unref?.();
pin = pin.trim();
const scope = {window: {}};
vm.runInNewContext(await readFile(new URL("../record-config.js", import.meta.url), "utf8"), scope);
vm.runInNewContext(await readFile(new URL("../records.js", import.meta.url), "utf8"), scope);
const api = scope.window.roomRecordAPI;
const origin = "https://sheng-cheng-2004.github.io";
async function call(route, {method = "GET", body, token} = {}) {
  const headers = {Origin: origin};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers["Content-Type"] = "application/json";
  const response = await fetch(`${api}${route}`, {method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000)});
  return {status: response.status, data: await response.json()};
}
const initial = await call("/records"); assert.equal(initial.status, 200);
const session = await call("/session", {method: "POST", body: {pin}}); pin = "";
assert.equal(session.status, 200, session.data.error);
const token = session.data.token;
try {
  const records = session.data.records ?? JSON.parse(JSON.stringify(scope.window.roomRecords));
  // Save exactly the existing collection, preserving its songs and order.
  const saved = await call("/records", {method: "PUT", token, body: {records, revision: session.data.revision}});
  assert.equal(saved.status, 200, saved.data.error);
  assert.deepEqual((await call("/records")).data.records, records);
} finally { await call("/session", {method: "DELETE", token}); }
assert.equal((await call("/records", {method: "PUT", token, body: {records: [], revision: 0}})).status, 401);
console.log("PASS: public reads, PIN unlock, durable save and logout protection.");
