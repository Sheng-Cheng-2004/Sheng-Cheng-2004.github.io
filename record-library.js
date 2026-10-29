import {appleSongReference, recordFromApple, sameSong, validateRecords} from "./record-utils.mjs";

// Apple's documented JSONP interface works directly from static sites and avoids
// region / data-center restrictions on server-side catalog requests.
function searchAppleCatalog(params, signal) {
  return new Promise((resolve, reject) => {
    const callback = `roomApple_${crypto.randomUUID().replaceAll("-", "")}`;
    const script = document.createElement("script");
    let timeout;
    const cleanup = () => {
      clearTimeout(timeout); script.remove(); delete window[callback]; signal.removeEventListener("abort", aborted);
    };
    const aborted = () => { cleanup(); reject(new DOMException("Search cancelled", "AbortError")); };
    window[callback] = data => {
      cleanup();
      const records = [...new Map((data.results || []).map(recordFromApple).filter(Boolean).map(record => [record.id, record])).values()];
      resolve(records);
    };
    script.onerror = () => { cleanup(); reject(new Error("Apple Music is unavailable. Try again.")); };
    timeout = setTimeout(() => { cleanup(); reject(new Error("Apple Music timed out. Try again.")); }, 15000);
    signal.addEventListener("abort", aborted, {once: true});
    if (signal.aborted) { aborted(); return; }
    const query = new URLSearchParams(params);
    query.set("callback", callback); query.set("entity", "song"); query.set("media", "music"); query.set("limit", "20");
    script.src = `https://itunes.apple.com/${query.has("id") ? "lookup" : "search"}?${query}`;
    document.head.append(script);
  });
}

export function createRecordLibrary({initialRecords, onChange, onPick, selectedId}) {
  const $ = id => document.getElementById(id);
  const dialog = $("record-library");
  const api = (window.roomRecordAPI || "").replace(/\/+$/, "");
  let records = validateRecords(initialRecords);
  let revision = 0;
  let token = null;
  let busy = false;
  let undo = null;
  let searchResults = [];
  let searchRequest = 0;
  let searchController = null;
  let sessionGeneration = 0;
  let loadFailed = false;
  let loadingRecords = false;

  function message(text) { $("library-message").textContent = text; }
  function button(text, label, action, className = "library-button") {
    const element = document.createElement("button");
    element.type = "button"; element.className = className;
    element.textContent = text; element.setAttribute("aria-label", label);
    element.dataset.editControl = "";
    element.addEventListener("click", action);
    return element;
  }
  async function request(path, {method = "GET", body, signal, authToken = token} = {}) {
    if (!api) throw new Error("The collection service is not connected.");
    const headers = {};
    if (authToken) headers.Authorization = `Bearer ${authToken}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    let response;
    try {
      response = await fetch(`${api}${path}`, {
        method, headers, body: body === undefined ? undefined : JSON.stringify(body),
        cache: "no-store", credentials: "omit", signal: signal || AbortSignal.timeout(15000)
      });
    } catch (error) {
      if (error.name === "AbortError") throw error;
      throw new Error("Couldn’t connect. Changes were not saved.");
    }
    let data;
    try { data = await response.json(); } catch { throw new Error("The collection service did not respond. Try again."); }
    if (!response.ok) {
      const error = new Error(data.error || "Something went wrong. Try again.");
      error.status = response.status; error.snapshot = data.snapshot;
      throw error;
    }
    return data;
  }
  function setBusy(value) {
    busy = value;
    dialog.setAttribute("aria-busy", String(value));
    dialog.querySelectorAll("[data-edit-control], #edit-records, #close-records, #library-pin-panel button, #library-pin, #library-search-form button, #record-search, #record-storefront, #undo-record-delete, #retry-records, #add-record, #close-record-search")
      .forEach(element => { element.disabled = value || element.dataset.boundary === "true"; });
  }
  function applySnapshot(snapshot, meta = {}) {
    if (snapshot.records !== null) records = validateRecords(snapshot.records);
    revision = snapshot.revision;
    render();
    onChange(records, meta);
  }
  function renderSearchResults() {
    $("record-search-results").replaceChildren();
    searchResults.forEach(record => {
      const row = document.createElement("article"); row.className = "record-search-result";
      const cover = new Image(); cover.src = record.cover; cover.alt = ""; cover.width = 60; cover.height = 60;
      const copy = document.createElement("div");
      const title = document.createElement("h4"); title.textContent = record.title;
      const artist = document.createElement("p"); artist.textContent = `${record.artist} / ${record.album}`;
      const link = document.createElement("a"); link.href = record.url; link.target = "_blank"; link.rel = "noopener noreferrer"; link.textContent = "Apple Music ↗";
      copy.append(title, artist, link);
      const exists = records.some(item => sameSong(item, record));
      const add = button(exists ? "Added" : "＋", `Add ${record.title} by ${record.artist}`, async () => {
        await save([...records, record], {reason: "add", focusId: record.id}, "Added.");
      }, "library-icon-button");
      add.disabled = exists || busy; add.dataset.boundary = String(exists);
      row.append(cover, copy, add); $("record-search-results").append(row);
    });
  }
  function render() {
    $("record-list").replaceChildren();
    if (!records.length) {
      const empty = document.createElement("p"); empty.className = "library-empty";
      empty.textContent = "No records yet.";
      $("record-list").append(empty);
    }
    records.forEach((record, index) => {
      const article = document.createElement("article"); article.className = "record-entry"; article.dataset.recordId = record.id;
      const pick = document.createElement("button"); pick.type = "button"; pick.className = "record-pick";
      pick.setAttribute("aria-label", `Play ${record.title} by ${record.artist}`);
      const cover = new Image(); cover.src = record.cover; cover.alt = `${record.album} — album cover`; cover.width = 600; cover.height = 600;
      const symbol = document.createElement("span"); symbol.textContent = "▶"; symbol.setAttribute("aria-hidden", "true");
      pick.append(cover, symbol); pick.addEventListener("click", () => { if (!busy) onPick(record, pick); });
      const copy = document.createElement("div"); copy.className = "record-copy";
      const title = document.createElement("h3"); title.textContent = record.title;
      const artist = document.createElement("p"); artist.textContent = `${record.artist} / ${record.album}`;
      const link = document.createElement("a"); link.href = record.url; link.target = "_blank"; link.rel = "noopener noreferrer"; link.textContent = "Open in Apple Music ↗";
      copy.append(title, artist, link); article.append(pick, copy);
      if (token) {
        const actions = document.createElement("div"); actions.className = "record-edit-actions"; actions.setAttribute("aria-label", `Edit ${record.title}`);
        for (const [offset, symbol, label] of [[-1, "↑", "Move up"], [1, "↓", "Move down"]]) {
          const move = button(symbol, `${label} ${record.title}`, async () => {
            const next = records.slice();
            [next[index], next[index + offset]] = [next[index + offset], next[index]];
            await save(next, {reason: "reorder", focusId: record.id, focusAction: label}, "Saved.");
          }, "library-icon-button");
          move.dataset.action = label;
          move.dataset.boundary = String(index + offset < 0 || index + offset >= records.length);
          move.disabled = busy || move.dataset.boundary === "true"; actions.append(move);
        }
        const remove = button("×", `Remove ${record.title}`, async () => {
          if (await save(records.filter(item => item.id !== record.id), {reason: "delete", removedIndex: index}, "Removed.")) {
            undo = {record, index}; $("undo-record-delete").hidden = false;
            const row = $("record-list").querySelectorAll(".record-entry")[Math.min(index, records.length - 1)];
            (row?.querySelector('[data-action="Remove"]') || $("add-record")).focus({preventScroll: true});
          }
        }, "library-icon-button record-remove");
        remove.dataset.action = "Remove"; actions.append(remove); article.append(actions);
      }
      $("record-list").append(article);
    });
    markSelected(); renderSearchResults(); setBusy(busy);
  }
  function markSelected() {
    dialog.querySelectorAll(".record-entry").forEach(row => {
      const current = row.dataset.recordId === selectedId();
      row.classList.toggle("is-selected", current);
      if (current) row.querySelector(".record-pick").setAttribute("aria-current", "true");
      else row.querySelector(".record-pick").removeAttribute("aria-current");
    });
  }
  async function save(next, meta, success) {
    if (!token || busy) return false;
    const session = sessionGeneration;
    setBusy(true); message("Saving…");
    try {
      const snapshot = await request("/records", {method: "PUT", body: {records: next, revision}});
      if (session !== sessionGeneration) return false;
      applySnapshot(snapshot, meta); message(success); setBusy(false);
      if (undo && records.some(record => sameSong(record, undo.record))) {
        undo = null; $("undo-record-delete").hidden = true;
      }
      if (meta.focusId) {
        const row = [...dialog.querySelectorAll(".record-entry")].find(item => item.dataset.recordId === meta.focusId);
        const action = row?.querySelector(`[data-action="${meta.focusAction}"]`);
        (action?.dataset.boundary === "true" ? row.querySelector(".record-pick") : action || row?.querySelector(".record-pick"))?.focus({preventScroll: true});
      }
      return true;
    } catch (error) {
      if (error.status === 401) lock();
      if (error.status === 409 && error.snapshot) {
        undo = null; $("undo-record-delete").hidden = true;
        applySnapshot(error.snapshot, {reason: "refresh"});
      }
      message(error.message); return false;
    } finally { setBusy(false); }
  }
  function collapseSearch() {
    ++searchRequest; searchController?.abort(); searchController = null;
    $("library-search-panel").hidden = true; $("add-record").setAttribute("aria-expanded", "false");
    searchResults = []; $("record-search-results").replaceChildren(); $("record-search-message").textContent = "";
  }
  function lock() {
    ++sessionGeneration;
    const oldToken = token; token = null;
    if (oldToken) request("/session", {method: "DELETE", authToken: oldToken}).catch(() => {});
    collapseSearch(); undo = null;
    $("undo-record-delete").hidden = true; $("library-add-area").hidden = true;
    $("library-pin-panel").hidden = true; $("library-pin-panel").reset();
    $("library-edit-note").hidden = true; $("edit-records-label").textContent = "Edit";
    $("edit-records").setAttribute("aria-expanded", "false"); dialog.classList.remove("is-editing"); render();
  }
  $("edit-records").addEventListener("click", () => {
    if (token) { lock(); message(""); return; }
    const panel = $("library-pin-panel"); panel.hidden = !panel.hidden;
    $("edit-records").setAttribute("aria-expanded", String(!panel.hidden));
    if (!panel.hidden) $("library-pin").focus();
    message("");
  });
  $("cancel-library-pin").addEventListener("click", () => { lock(); message(""); $("edit-records").focus(); });
  $("library-pin-panel").addEventListener("submit", async event => {
    event.preventDefault(); if (busy) return;
    const session = sessionGeneration;
    setBusy(true); message("Unlocking…");
    try {
      const data = await request("/session", {method: "POST", body: {pin: $("library-pin").value}, authToken: null});
      if (session !== sessionGeneration) {
        request("/session", {method: "DELETE", authToken: data.token}).catch(() => {}); return;
      }
      token = data.token; $("library-pin-panel").reset(); $("library-pin-panel").hidden = true;
      $("edit-records-label").textContent = "Done"; $("edit-records").setAttribute("aria-expanded", "true");
      $("library-add-area").hidden = false; $("library-edit-note").hidden = false; dialog.classList.add("is-editing");
      applySnapshot(data, {reason: "refresh"}); loadFailed = false; $("retry-records").hidden = true; message("");
      $("library-add-area").scrollIntoView({behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "end"});
    } catch (error) { setBusy(false); message(error.message); $("library-pin").focus(); $("library-pin").select(); }
    finally { setBusy(false); }
  });
  $("add-record").addEventListener("click", () => {
    if (!token) return;
    const open = $("library-search-panel").hidden;
    if (!open) { collapseSearch(); return; }
    $("library-search-panel").hidden = false; $("add-record").setAttribute("aria-expanded", "true");
    $("record-search").focus();
  });
  $("close-record-search").addEventListener("click", () => { collapseSearch(); $("add-record").focus(); });
  $("library-search-form").addEventListener("submit", async event => {
    event.preventDefault(); if (!token || busy) return;
    const query = $("record-search").value.trim(); if (!query) return;
    const reference = appleSongReference(query);
    if (/^https?:\/\//i.test(query) && !reference) {
      $("record-search-message").textContent = "Paste a song link, rather than an album link."; return;
    }
    const requestId = ++searchRequest;
    searchController?.abort(); searchController = new AbortController();
    searchResults = []; renderSearchResults(); $("record-search-message").textContent = "Searching…";
    const params = new URLSearchParams({country: reference?.country || $("record-storefront").value});
    params.set(reference ? "id" : "term", reference ? reference.id : query);
    try {
      const results = await searchAppleCatalog(params, searchController.signal);
      if (requestId !== searchRequest || !token) return;
      searchResults = validateRecords(results); renderSearchResults();
      $("record-search-message").textContent = searchResults.length ? `${searchResults.length} ${searchResults.length === 1 ? "track" : "tracks"}` : "No previews found. Try another region.";
    } catch (error) {
      if (requestId !== searchRequest) return;
      if (error.status === 401) lock();
      $("record-search-message").textContent = error.message;
      if (error.status === 401) message(error.message);
    }
  });
  $("undo-record-delete").addEventListener("click", async () => {
    if (!undo || busy) return;
    const next = records.slice(); next.splice(Math.min(undo.index, next.length), 0, undo.record);
    if (await save(next, {reason: "restore"}, "Restored.")) {
      undo = null; $("undo-record-delete").hidden = true; $("edit-records").focus({preventScroll: true});
    }
  });
  dialog.addEventListener("cancel", event => { if (busy) event.preventDefault(); });
  dialog.addEventListener("close", () => { lock(); message(""); });
  window.addEventListener("pagehide", () => {
    if (token) fetch(`${api}/session`, {method: "DELETE", headers: {Authorization: `Bearer ${token}`}, keepalive: true}).catch(() => {});
    lock();
  });
  render();
  async function refreshRecords() {
    if (!api || loadingRecords || token || busy) return;
    loadingRecords = true;
    const generation = sessionGeneration;
    const startedRevision = revision;
    $("retry-records").disabled = true;
    try {
      const snapshot = await request("/records", {authToken: null});
      // A delayed read must not overwrite an edit or a newer authenticated snapshot.
      if (generation !== sessionGeneration || token || revision !== startedRevision) return;
      applySnapshot(snapshot, {reason: "load"});
      loadFailed = false; $("retry-records").hidden = true; message("");
    } catch {
      if (generation !== sessionGeneration || token) return;
      loadFailed = true; $("retry-records").hidden = false; message("Couldn’t load collection.");
    } finally { loadingRecords = false; $("retry-records").disabled = busy; }
  }
  $("retry-records").addEventListener("click", refreshRecords);
  const ready = refreshRecords();
  return {getRecords: () => records, ready, markSelected, isBusy: () => busy, refreshIfNeeded: () => loadFailed && refreshRecords()};
}
