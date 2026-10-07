# Adding music to the room

All songs live in `records.js`. Copy one item inside `window.roomRecords = [...]`, separating items with commas.

```js
{
  id: "unique-song-name",
  title: "Song title",
  artist: "Artist name",
  album: "Album title · Year",
  description: "Your personal note about this song.",
  cover: "https://.../album-cover.jpg",
  preview: "https://.../audio-preview.m4a",
  url: "https://music.apple.com/..."
}
```

- `id`: a unique short name, using English letters and hyphens.
- `description`: the note displayed beside the cover; edit it freely.
- `cover`: a square cover image URL or a local path such as `assets/music/cover.jpg`.
- `preview`: a direct playable audio URL, not the Apple Music song-page URL. The current collection uses Apple Music previews, not full tracks.
- `url`: the full song page opened by the Apple Music link.

Find the song with Apple's public catalog endpoint: `https://itunes.apple.com/search?term=ARTIST+SONG&entity=song&country=us&limit=10` (use `country=tw` for the Taiwan catalog). Match the exact artist, song and album, then copy `previewUrl`, `trackViewUrl`, and `artworkUrl100`. In the artwork URL, replace `100x100bb` with `600x600bb` for a larger cover. Preview availability can vary by region and over time.

Save `records.js`, refresh Misc, and click the new cover to check playback. No HTML or animation changes are needed. Publish the updated file with the rest of the website.
