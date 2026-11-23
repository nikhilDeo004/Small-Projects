
const fs = require("fs");
const path = require("path");

const audioFolder = path.join(__dirname, "audios");

const audioFiles = fs.readdirSync(audioFolder).filter(file =>
  /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(file)
);

const songs = audioFiles.map(file => `audios/${file}`);

const output = `const songs = ${JSON.stringify(songs, null, 2)};`;

fs.writeFileSync(
  path.join(__dirname, "songs.js"),
  output
);

console.log(`Found ${songs.length} audio files.`);
