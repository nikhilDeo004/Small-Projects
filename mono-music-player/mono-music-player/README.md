# MONO Music Player

A minimal, responsive, black-and-white music player built with HTML, CSS and vanilla JavaScript. No framework or backend is required.

## Project structure

```text
mono-music-player/
├── index.html
├── style.css
├── script.js
├── songs.js
├── vercel.json
└── audios/
    └── (put your .mp3 / .ogg / .wav files here)
```

## Add your music

1. Copy your audio files into the `audios/` folder.
2. Open `songs.js`.
3. Add one object per audio file, using its exact filename:

```js
const songs = [
  {
    title: "My Track",
    artist: "My Artist",
    src: "audios/my-track.mp3"
  }
];
```

The filename and capitalization must match the actual file. The title and artist are displayed in the player and playlist.

## Run locally

You can open `index.html` in a browser for a quick test. For a more realistic local server, use VS Code Live Server or run:

```bash
python -m http.server 8000
```

Then visit http://localhost:8000.

## Deploy to Vercel

1. Push the entire project folder to a GitHub repository.
2. Import that repository at https://vercel.com/new.
3. Select **Other** as the framework preset (or leave the detected static settings).
4. Leave Build Command and Output Directory empty.
5. Deploy.

Keep `audios/` in the repository so Vercel can serve the files. Be mindful of GitHub and Vercel file-size and bandwidth limits if your music collection is large. For a large library, use object storage or a media CDN.

## Features

- Play, pause, previous and next
- Search by track title or artist
- Playlist with current-track highlight
- Seek/progress and volume controls
- Shuffle and repeat-current-track
- Media Session metadata and supported lock-screen/headset controls
- Responsive black-and-white layout

## Background playback note

The browser Media Session API can expose track information and playback controls on supported browsers and devices. Audio may continue when the screen is locked or the browser is in the background, subject to browser and operating-system behavior. A website cannot guarantee playback after its tab is closed or the browser is force-quit. Test on your target mobile browsers.

## Audio rights

Only upload and distribute audio that you own or are authorized to use.
