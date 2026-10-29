import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import vm from "node:vm";
import {webcrypto} from "node:crypto";
import worker, {RecordCabinet} from "../record-service/worker.mjs";
import {appleSongReference, nextRecord, recordFromApple, sameSong, validateRecords} from "../record-utils.mjs";
import {MemoryStorage} from "./memory-storage.mjs";

if (!globalThis.crypto) globalThis.crypto = webcrypto;
const context = {window: {}};
vm.runInNewContext(await readFile(new URL("../records.js", import.meta.url), "utf8"), context);
const seed = JSON.parse(JSON.stringify(context.window.roomRecords));
const origin = "https://sheng-cheng-2004.github.io";
const allowedOrigins = (await readFile(new URL("../record-service/wrangler.toml", import.meta.url), "utf8")).match(/ALLOWED_ORIGINS\s*=\s*"([^"]+)"/)[1];

function setup() {
  const storage = new MemoryStorage();
  const env = {CABINET_PIN: "123456", ALLOWED_ORIGINS: allowedOrigins};
  let cabinet = new RecordCabinet({storage}, env);
  env.CABINET = {idFromName: value => value, get: () => cabinet};
  return {
    storage,
    restart() { cabinet = new RecordCabinet({storage}, env); },
    async call(path, {method = "GET", body, token, site = origin, ip = "test-ip"} = {}) {
      const headers = {Origin: site, "CF-Connecting-IP": ip};
      if (body !== undefined) headers["Content-Type"] = "application/json";
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await worker.fetch(new Request(`https://cabinet.test${path}`, {method, headers, body: body === undefined ? undefined : JSON.stringify(body)}), env);
      const data = response.status === 204 ? null : await response.json();
      return {status: response.status, headers: response.headers, data};
    },
    async unlock() { return (await this.call("/session", {method: "POST", body: {pin: "123456"}})).data.token; }
  };
}

test("existing records are accepted; Apple links resolve exact tracks and storefronts", () => {
  assert.equal(validateRecords(seed).length, 3);
  assert.deepEqual(appleSongReference(seed[0].url), {id: "152203057", country: "tw"});
  assert.deepEqual(appleSongReference("https://music.apple.com/us/song/example/1234"), {id: "1234", country: "us"});
  assert.equal(appleSongReference("https://evil.test/us/song/1234"), null);
  assert.equal(appleSongReference("https://music.apple.com/us/album/example/1234"), null);
  assert.equal(appleSongReference("http://music.apple.com/us/song/example/1234"), null);
});
test("queue follows the current order after insertion, reordering and wrapping", () => {
  assert.equal(nextRecord(seed, seed[0].id).id, seed[1].id);
  assert.equal(nextRecord(seed, seed[2].id).id, seed[0].id);
  const reordered = [seed[2], seed[0], seed[1]];
  assert.equal(nextRecord(reordered, seed[2].id).id, seed[0].id);
  assert.equal(nextRecord([seed[0]], seed[0].id).id, seed[0].id);
  assert.equal(nextRecord([], seed[0].id), null);
});
test("catalog conversion excludes unplayable items and detects imported duplicates", () => {
  const item = {kind: "song", trackId: 152203057, trackName: "Test", artistName: "Artist", collectionName: "Album", releaseDate: "2000-01-01", artworkUrl100: seed[0].cover.replace("600x600bb", "100x100bb"), previewUrl: seed[0].preview, trackViewUrl: seed[0].url};
  const imported = recordFromApple(item);
  assert.equal(imported.id, "apple-152203057");
  assert.equal(sameSong(seed[0], imported), true);
  assert.equal(imported.cover, seed[0].cover);
  assert.equal(recordFromApple({...item, previewUrl: ""}), null);
  assert.equal(recordFromApple({...item, kind: "music-video"}), null);
});
test("visitors can read but cannot edit without a valid session", async () => {
  const app = setup();
  assert.deepEqual((await app.call("/records")).data, {records: null, revision: 0});
  assert.equal((await app.call("/records", {method: "PUT", body: {records: seed, revision: 0}})).status, 401);
  assert.equal((await app.call("/catalog?term=test")).status, 401);
  assert.equal((await app.call("/session", {method: "POST", body: {pin: "999999"}})).status, 401);
});
test("one unlock authorizes repeated edits, persists order across object restarts and preserves an empty cabinet", async () => {
  const app = setup(); const token = await app.unlock();
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.equal([...app.storage.values.keys()].some(key => key.includes(token)), false);
  let result = await app.call("/records", {method: "PUT", token, body: {records: seed, revision: 0}});
  assert.equal(result.status, 200);
  const reordered = [seed[2], seed[0]];
  result = await app.call("/records", {method: "PUT", token, body: {records: reordered, revision: 1}});
  assert.equal(result.data.revision, 2);
  app.restart();
  assert.deepEqual((await app.call("/records")).data.records, reordered);
  result = await app.call("/records", {method: "PUT", token, body: {records: [], revision: 2}});
  assert.equal(result.status, 200);
  assert.deepEqual((await app.call("/records")).data.records, []);
});
test("simultaneous edits cannot silently overwrite another tab", async () => {
  const app = setup(); const token = await app.unlock();
  const results = await Promise.all([
    app.call("/records", {method: "PUT", token, body: {records: seed, revision: 0}}),
    app.call("/records", {method: "PUT", token, body: {records: [], revision: 0}})
  ]);
  assert.deepEqual(results.map(result => result.status), [200, 409]);
  assert.deepEqual(results[1].data.snapshot.records, seed);
});
test("logout and expiration revoke write access", async () => {
  const app = setup(); const token = await app.unlock();
  assert.equal((await app.call("/session", {method: "DELETE", token})).status, 200);
  assert.equal((await app.call("/records", {method: "PUT", token, body: {records: [], revision: 0}})).status, 401);
  const expiredToken = await app.unlock();
  for (const [key] of app.storage.values) if (key.startsWith("session:")) await app.storage.put(key, {expiresAt: 1});
  assert.equal((await app.call("/records", {method: "PUT", token: expiredToken, body: {records: [], revision: 0}})).status, 401);
});
test("PIN guessing is limited persistently, including concurrent requests", async () => {
  const app = setup();
  const results = await Promise.all(Array.from({length: 6}, () => app.call("/session", {method: "POST", body: {pin: "999999"}})));
  assert.deepEqual(results.map(result => result.status), [401, 401, 401, 401, 401, 429]);
  app.restart();
  assert.equal((await app.call("/session", {method: "POST", body: {pin: "123456"}})).status, 429);
  assert.equal((await app.call("/session", {method: "POST", body: {pin: "123456"}, ip: "other-ip"})).status, 200);
});
test("CORS only allows the configured website; responses cannot be cached", async () => {
  const app = setup();
  assert.equal((await app.call("/session", {method: "POST", site: "https://evil.test", body: {pin: "123456"}})).status, 403);
  const preflight = await app.call("/records", {method: "OPTIONS"});
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("Access-Control-Allow-Origin"), origin);
  const read = await app.call("/records");
  assert.equal(read.headers.get("Cache-Control"), "no-store");
  assert.equal(JSON.stringify(read.data).includes("123456"), false);
});
test("Live Server can load and unlock the cabinet; other local origins remain blocked", async () => {
  const app = setup();
  for (const site of ["http://127.0.0.1:5500", "http://localhost:5500"]) {
    const read = await app.call("/records", {site});
    assert.equal(read.status, 200);
    assert.equal(read.headers.get("Access-Control-Allow-Origin"), site);
    const preflight = await app.call("/session", {site, method: "OPTIONS"});
    assert.equal(preflight.status, 204);
    const unlock = await app.call("/session", {site, method: "POST", body: {pin: "123456"}});
    assert.equal(unlock.status, 200);
  }
  for (const site of ["http://127.0.0.1:5501", "http://127.0.0.1.evil.test:5500", "null"]) {
    assert.equal((await app.call("/records", {site})).status, 403);
  }
});
test("unsafe media, duplicate IDs and invalid revisions leave saved data untouched", async () => {
  const app = setup(); const token = await app.unlock();
  for (const records of [[{...seed[0], cover: "javascript:alert(1)"}], [seed[0], seed[0]], [{...seed[0], preview: "https://evil.test/song.m4a"}]]) {
    assert.equal((await app.call("/records", {method: "PUT", token, body: {records, revision: 0}})).status, 400);
  }
  assert.equal((await app.call("/records", {method: "PUT", token, body: {records: seed, revision: "0"}})).status, 409);
  assert.deepEqual((await app.call("/records")).data, {records: null, revision: 0});
});
test("expired login limits and session records are cleaned without deleting the collection", async () => {
  const app = setup(); const token = await app.unlock();
  await app.call("/records", {method: "PUT", token, body: {records: seed, revision: 0}});
  await app.storage.put("login:expired", {attempts: 5, expiresAt: 1});
  await app.storage.put("session:expired", {expiresAt: 1});
  const cabinet = new RecordCabinet({storage: app.storage}, {});
  await cabinet.alarm();
  assert.equal(await app.storage.get("login:expired"), undefined);
  assert.equal(await app.storage.get("session:expired"), undefined);
  assert.deepEqual((await app.call("/records")).data.records, seed);
  assert.ok(app.storage.alarmAt > Date.now());
});
