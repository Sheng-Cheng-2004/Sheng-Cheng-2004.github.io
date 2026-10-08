"use strict";
// Add future records here; each item has a cover, note, preview and full-song link.
const records = window.roomRecords;
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
const sceneNames = ["Moments", "Record Corner", "Bookshelf"];
const instructions = ["Little moments, pinned to the wall.", "Open the cabinet and pick a record.", "A place for favorite stories."];

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
  $("room-instruction").textContent = instructions[sceneIndex];
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
}
$("open-records").addEventListener("click", openLibrary);
$("close-records").addEventListener("click", () => dialog.close());
dialog.addEventListener("close", () => {
  document.body.classList.remove("library-open");
  $("open-records").focus({preventScroll:true});
});
// Native <dialog> handles Escape and keeps keyboard focus inside the overlay.
dialog.addEventListener("click", event => {
  const rect = dialog.getBoundingClientRect();
  if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
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
  if (reducedMotion.matches || !Element.prototype.animate) return;
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
    {transform:`translate(${dx}px,${dy}px) rotate(-2deg) scale(${end.width / start.width})`,transformOrigin:"top left"}
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
  const request = ++playbackRequest;
  $("room-status").textContent = "Bringing some sound into the room…";
  try {
    await audio.play();
  } catch {
    if (request !== playbackRequest) return;
    setPlaybackState(false);
    $("room-status").textContent = "Preview unavailable. Open the full song on Apple Music.";
  }
}
function selectRecord(record, coverButton) {
  const start = coverButton.getBoundingClientRect();
  if (selectedRecord?.id !== record.id) {
    selectedRecord = record;
    audio.src = record.preview;
  }
  $("now-playing-title").textContent = record.title;
  const artistLabel = $("now-playing-artist");
  if (artistLabel) artistLabel.textContent = `${record.artist} / ${record.album}`;
  $("full-song-link").href = record.url;
  $("room-play").disabled = false;
  $("room-audio-panel").hidden = false;
  // Start inside the click gesture so mobile browsers can allow playback.
  playRecord();
  dialog.close();
  flyToShelf(record, start);
}
for (const record of records) {
  const article = document.createElement("article");
  article.className = "record-entry";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "record-pick";
  button.setAttribute("aria-label", `Play ${record.title} by ${record.artist}`);
  const cover = new Image();
  cover.src = record.cover;
  cover.alt = `${record.album} — album cover`;
  cover.width = 600; cover.height = 600;
  const symbol = document.createElement("span");
  symbol.textContent = "▶"; symbol.setAttribute("aria-hidden", "true");
  button.append(cover, symbol);
  button.addEventListener("click", () => selectRecord(record, button));
  const copy = document.createElement("div"); copy.className = "record-copy";
  const title = document.createElement("h3"); title.textContent = record.title;
  const artist = document.createElement("p"); artist.textContent = `${record.artist} / ${record.album}`;
  const description = document.createElement("p"); description.className = "record-description"; description.textContent = record.description;
  const link = document.createElement("a"); link.href = record.url; link.target = "_blank"; link.rel = "noopener noreferrer"; link.textContent = "Open in Apple Music ↗";
  copy.append(title, artist, description, link); article.append(button,copy); $("record-list").append(article);
}
$("room-play").addEventListener("click", () => {
  if (!selectedRecord) return;
  if (audio.paused) playRecord();
  else { ++playbackRequest; audio.pause(); }
});
audio.addEventListener("play", () => {setPlaybackState(true); $("room-status").textContent = `Previewing: ${selectedRecord.title} · ${selectedRecord.artist}`;});
audio.addEventListener("pause", () => {setPlaybackState(false); if (!audio.ended && selectedRecord) $("room-status").textContent = "Paused. Pick up where you left off.";});
audio.addEventListener("ended", () => {setPlaybackState(false); $("room-status").textContent = "Preview ended. Play it again or open the full song on Apple Music.";});
audio.addEventListener("error", () => {setPlaybackState(false); $("room-status").textContent = "Preview unavailable. Open the full song on Apple Music.";});
window.addEventListener("resize", stopFlight);
changeScene(1);
