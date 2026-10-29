import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFile} from "node:fs/promises";
import {createRecordLibrary} from "../record-library.js";

const scope = {window: {}};
vm.runInNewContext(await readFile(new URL("../records.js", import.meta.url), "utf8"), scope);
const seed = JSON.parse(JSON.stringify(scope.window.roomRecords));

// Minimal DOM adapter: these tests exercise asynchronous loading, not layout.
class Element {
  constructor() {
    this.dataset = {}; this.hidden = false; this.disabled = false;
    this.textContent = ""; this.handlers = new Map();
    this.classList = {add() {}, remove() {}, toggle() {}};
  }
  addEventListener(type, callback) { this.handlers.set(type, callback); }
  async emit(type) { await this.handlers.get(type)?.({preventDefault() {}}); }
  setAttribute() {} removeAttribute() {} append() {} replaceChildren() {}
  querySelectorAll() { return []; }
  focus() {} select() {} reset() {} scrollIntoView() {}
}
function setup(t, fetch) {
  const elements = new Map();
  const get = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
  const replacements = {
    window: {roomRecordAPI: "https://collection.test", addEventListener() {}, matchMedia: () => ({matches: true})},
    document: {getElementById: get, createElement: () => new Element()},
    Image: Element, fetch
  };
  for (const [key, value] of Object.entries(replacements)) {
    const old = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, {value, writable: true, configurable: true});
    t.after(() => { if (old) Object.defineProperty(globalThis, key, old); else delete globalThis[key]; });
  }
  const changes = [];
  const library = createRecordLibrary({initialRecords: seed, onChange: (records, meta) => changes.push({records, meta}), onPick() {}, selectedId: () => null});
  return {library, get, changes};
}

test("failed collection reads show Retry; retry loads the real order and clears the warning", async t => {
  let calls = 0;
  const actual = [seed[2], seed[0]];
  const {library, get, changes} = setup(t, async () => {
    if (++calls === 1) throw new TypeError("Network unavailable");
    return Response.json({records: actual, revision: 7});
  });
  await library.ready;
  assert.equal(get("retry-records").hidden, false);
  assert.equal(get("library-message").textContent, "Couldn’t load collection.");
  assert.deepEqual(library.getRecords(), seed);
  await library.refreshIfNeeded();
  assert.deepEqual(library.getRecords(), actual);
  assert.equal(get("retry-records").hidden, true);
  assert.equal(get("library-message").textContent, "");
  assert.equal(changes.at(-1).meta.reason, "load");
});

test("a delayed initial read cannot overwrite a newer collection returned by PIN unlock", async t => {
  let finishRead;
  const authenticated = [seed[1]];
  const {library, get} = setup(t, async (_url, options) => {
    if (options.method === "POST") return Response.json({records: authenticated, revision: 10, token: "test-session"});
    return new Promise(resolve => { finishRead = resolve; });
  });
  get("library-pin").value = "123456";
  await get("library-pin-panel").emit("submit");
  finishRead(Response.json({records: seed, revision: 1}));
  await library.ready;
  assert.deepEqual(library.getRecords(), authenticated);
  assert.equal(get("edit-records-label").textContent, "Done");
});
