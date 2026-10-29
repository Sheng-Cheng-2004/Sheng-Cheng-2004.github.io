"use strict";
import {createRecordLibrary} from "./record-library.js";
import {nextRecord} from "./record-utils.mjs";
let records = window.roomRecords;
let library;
const $ = (id) => document.getElementById(id);
const track = $("room-track");
const scenes = Array.from(document.querySelectorAll(".room-scene"));
const locations = Array.from(document.querySelectorAll("[data-scene]"));
const dialog = $("record-library");
const audio = $("song-audio");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let sceneIndex = 1;
let selectedRecord = null;
let playbackRequest = 0;
let flight = null;
let listenerHasChosen = false;
const sceneNames = ["Moments", "Record Corner", "Bookshelf"];

function alignRoom() {
  const width = scenes[0].getBoundingClientRect().width;
  track.style.transform = `translateX(${-width * (sceneIndex + 0.5)}px)`;
}
function changeScene(index) {
  const next = Math.max(0, Math.min(scenes.length - 1, index));
  // Move focus before making a panel inert (e.g. after using a keyboard shortcut).
  if (next !== sceneIndex && scenes[sceneIndex].contains(document.activeElement)) locations[next].focus({preventScroll:true});
  sceneIndex = next;
  scenes.forEach((scene, i) => {
    scene.inert = i !== sceneIndex;
    scene.classList.toggle("is-active", i === sceneIndex);
  });
  locations.forEach((button, i) => {
    if (i === sceneIndex) button.setAttribute("aria-current", "true");
    else button.removeAttribute("aria-current");
  });
  $("room-prev").disabled = sceneIndex === 0;
  $("room-next").disabled = sceneIndex === 2;
  $("room-prev").setAttribute("aria-label", sceneIndex > 0 ? `Go to ${sceneNames[sceneIndex - 1]}` : "At Moments");
  $("room-next").setAttribute("aria-label", sceneIndex < 2 ? `Go to ${sceneNames[sceneIndex + 1]}` : "At Bookshelf");
  alignRoom();
}
$("room-prev").addEventListener("click", () => changeScene(sceneIndex - 1));
$("room-next").addEventListener("click", () => changeScene(sceneIndex + 1));
locations.forEach(button => button.addEventListener("click", () => changeScene(Number(button.dataset.scene))));
new ResizeObserver(alignRoom).observe(document.querySelector(".room-viewport"));
$("main-content").addEventListener("keydown", event => {
  if (dialog.open || event.target.closest("audio, input, textarea, select")) return;
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault();
    changeScene(sceneIndex + (event.key === "ArrowLeft" ? -1 : 1));
  }
});
function openLibrary() {
  dialog.showModal();
  document.body.classList.add("library-open");
  library?.refreshIfNeeded();
}
$("open-records").addEventListener("click", openLibrary);
$("close-records").addEventListener("click", () => { if (!library.isBusy()) dialog.close(); });
dialog.addEventListener("close", () => {
  document.body.classList.remove("library-open");
  $("open-records").focus({preventScroll:true});
});
// Native <dialog> handles Escape and keeps keyboard focus inside the overlay.
dialog.addEventListener("click", event => {
  const rect = dialog.getBoundingClientRect();
  if (!library.isBusy() && event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
});
function stopFlight() {
  if (flight) { flight.animation.cancel(); flight.image.remove(); flight = null; }
  $("displayed-album").style.visibility = "";
}
function flyToShelf(record, start) {
  stopFlight();
  const displayed = $("displayed-album");
  displayed.src = record.cover;
  displayed.alt = `${record.album} by ${record.artist} — album cover`;
  displayed.hidden = false;
  $("shelf-empty").hidden = true;
  if (!start || reducedMotion.matches || !Element.prototype.animate) return;
  const end = displayed.getBoundingClientRect();
  const image = new Image();
  image.src = record.cover;
  image.alt = "";
  image.className = "album-flight";
  image.style.left = `${start.left}px`;
  image.style.top = `${start.top}px`;
  image.style.width = `${start.width}px`;
  image.style.height = `${start.height}px`;
  document.body.append(image);
  displayed.style.visibility = "hidden";
  const dx = end.left - start.left;
  const dy = end.top - start.top;
  const animation = image.animate([
    {transform:"translate(0,0) rotate(-3deg) scale(1)",transformOrigin:"top left"},
    {transform:`translate(${dx * .5}px,${dy * .5 - 50}px) rotate(8deg) scale(.85)`,transformOrigin:"top left",offset:.5},
    {transform:`translate(${dx}px,${dy}px) rotate(0deg) scale(${end.width / start.width})`,transformOrigin:"top left"}
  ], {duration:850,easing:"cubic-bezier(.22,.65,.25,1)",fill:"forwards"});
  flight = {image,animation};
  animation.finished.catch(() => {}).finally(() => {
    image.remove();
    if (flight?.image === image) { flight = null; displayed.style.visibility = ""; }
  });
}
function setPlaybackState(playing) {
  document.body.classList.toggle("is-playing", playing);
  $("room-play-symbol").textContent = playing ? "Ⅱ" : "▶";
  $("room-play").setAttribute("aria-label", `${playing ? "Pause" : "Play"} ${selectedRecord ? selectedRecord.title + " preview" : "music"}`);
  $("room-play").setAttribute("aria-pressed", String(playing));
}
async function playRecord() {
  if (!selectedRecord) return;
  const request = ++playbackRequest;
  $("room-status").textContent = "Loading preview…";
  try {
    await audio.play();
  } catch {
    if (request !== playbackRequest) return;
    setPlaybackState(false);
    $("room-status").textContent = "Preview unavailable. Open the full song on Apple Music.";
  }
}
function loadRecord(record, {autoplay = false, start = null} = {}) {
  ++playbackRequest;
  if (selectedRecord?.id !== record.id) {
    audio.pause();
    selectedRecord = record;
    audio.src = record.preview;
  }
  if (audio.ended) audio.currentTime = 0;
  $("now-playing-title").textContent = record.title;
  $("full-song-link").href = record.url;
  $("room-play").disabled = false;
  $("room-audio-panel").hidden = false;
  flyToShelf(record, start);
  library?.markSelected();
  if (autoplay) playRecord();
  else {
    setPlaybackState(false);
    $("room-status").textContent = "Press play to listen.";
  }
}
function clearTurntable() {
  ++playbackRequest; audio.pause(); audio.removeAttribute("src"); audio.load();
  selectedRecord = null; stopFlight(); setPlaybackState(false);
  $("displayed-album").hidden = true; $("shelf-empty").hidden = false;
  $("room-play").disabled = true; $("room-audio-panel").hidden = true;
  $("now-playing-title").textContent = "No records yet.";
  $("room-status").textContent = "";
}
function selectRecord(record, coverButton) {
  listenerHasChosen = true;
  const start = coverButton.getBoundingClientRect();
  // Start inside the click gesture so mobile browsers can allow playback.
  loadRecord(record, {autoplay: true, start});
  dialog.close();
}
library = createRecordLibrary({
  initialRecords: records,
  selectedId: () => selectedRecord?.id,
  onPick: selectRecord,
  onChange(next, meta) {
    const wasPlaying = !audio.paused;
    const oldIndex = records.findIndex(record => record.id === selectedRecord?.id);
    records = next;
    if (!records.length) { clearTurntable(); return; }
    if (!listenerHasChosen && meta.reason === "load") loadRecord(records[0]);
    else if (!records.some(record => record.id === selectedRecord?.id)) {
      loadRecord(records[(meta.removedIndex ?? Math.max(0, oldIndex)) % records.length], {autoplay: wasPlaying});
    }
    library?.markSelected();
  }
});
$("room-play").addEventListener("click", () => {
  if (!selectedRecord) return;
  listenerHasChosen = true;
  if (audio.paused) playRecord();
  else { ++playbackRequest; audio.pause(); }
});
audio.addEventListener("play", () => {if (!selectedRecord) return; listenerHasChosen = true; setPlaybackState(true); $("room-status").textContent = "";});
audio.addEventListener("pause", () => {setPlaybackState(false); $("room-status").textContent = "";});
audio.addEventListener("ended", () => {
  const next = nextRecord(records, selectedRecord?.id);
  if (next) loadRecord(next, {autoplay: true});
  else clearTurntable();
});
audio.addEventListener("error", () => {setPlaybackState(false); $("room-status").textContent = "Preview unavailable. Open the full song on Apple Music.";});
window.addEventListener("resize", stopFlight);
changeScene(1);
if (records.length) loadRecord(records[0]);
