// Shared, dependency-free validation for the browser and the saving service.
export function appleSongReference(value) {
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== "https:" || url.hostname !== "music.apple.com" || url.port) return null;
  const segments = url.pathname.split("/").filter(Boolean);
  const country = /^[a-z]{2}$/i.test(segments[0]) ? segments[0].toLowerCase() : "us";
  const id = url.searchParams.get("i") || (segments[1] === "song" ? segments.at(-1) : "");
  return /^\d{1,20}$/.test(id) ? {id, country} : null;
}

function appleMediaURL(value, localCover = false) {
  if (localCover && /^assets\/[a-z0-9_./-]+$/i.test(value) && !value.includes("..")) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.port && !url.username && !url.password &&
      ["mzstatic.com", "itunes.apple.com"].some(host => url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch { return false; }
}

export function validateRecords(value) {
  if (!Array.isArray(value) || value.length > 300) throw new Error("The cabinet can hold up to 300 records.");
  const ids = new Set();
  return value.map(record => {
    const clean = {};
    for (const [key, limit] of Object.entries({id:100, title:300, artist:300, album:500, description:1000, cover:2048, preview:2048, url:2048})) {
      if (typeof record?.[key] !== "string" || record[key].length > limit) throw new Error("Incomplete track details. Search for this song again.");
      clean[key] = record[key].trim();
    }
    if (!/^[a-z0-9_-]+$/i.test(clean.id) || ids.has(clean.id) || !clean.title || !clean.artist ||
        !appleSongReference(clean.url) || !appleMediaURL(clean.cover, true) || !appleMediaURL(clean.preview)) {
      throw new Error("Invalid track details or duplicate record.");
    }
    ids.add(clean.id);
    return clean;
  });
}

export function recordFromApple(item) {
  if (item.kind !== "song" || !item.previewUrl || !item.trackViewUrl) return null;
  const record = {
    id: `apple-${item.trackId}`, title: item.trackName, artist: item.artistName,
    album: [item.collectionName, item.releaseDate?.slice(0, 4)].filter(Boolean).join(" · "),
    description: "", cover: (item.artworkUrl100 || "").replace(/100x100bb/, "600x600bb"),
    preview: item.previewUrl, url: item.trackViewUrl
  };
  try { return validateRecords([record])[0]; } catch { return null; }
}

export function sameSong(a, b) {
  const left = appleSongReference(a.url), right = appleSongReference(b.url);
  return a.id === b.id || Boolean(left && right && left.id === right.id);
}

export function nextRecord(records, selectedId) {
  if (!records.length) return null;
  return records[(records.findIndex(record => record.id === selectedId) + 1) % records.length];
}
