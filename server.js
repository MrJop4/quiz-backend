const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const app = express();
const server = http.createServer(app);

// --- CORS POUR NETLIFY (MODIF ICI) ---
const io = new Server(server, {
  cors: {
    origin: [
      "https://684489ef856308d812ee4955--classy-squirrel-45f2fb.netlify.app",
      "https://classy-squirrel-45f2fb.netlify.app"
    ],
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname + '/'));

let rooms = {};

function randomRoomCode(length = 6) {
  let chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < length; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

io.on('connection', (socket) => {
  // Créer une salle
  socket.on('createRoom', ({ name }) => {
    let code;
    do { code = randomRoomCode(); } while (rooms[code]);
    rooms[code] = { players: [], host: socket.id, questions: null, started: false };
    socket.join(code);
    rooms[code].players.push({ id: socket.id, name: name || "Streamer", score: 0, isHost: true });
    socket.emit('roomCreated', { code });
    io.to(code).emit('playerList', rooms[code].players);
  });

  // Rejoindre une salle
  socket.on('joinRoom', ({ code, name }) => {
    if (!rooms[code]) {
      socket.emit('joinError', 'Code inconnu');
      return;
    }
    if (rooms[code].started) {
      socket.emit('joinError', 'Partie déjà commencée');
      return;
    }
    socket.join(code);
    rooms[code].players.push({ id: socket.id, name, score: 0, isHost: false });
    io.to(code).emit('playerList', rooms[code].players);
    socket.emit('joinedRoom', { code });
  });

  // Lancement de la partie par le streamer
  socket.on('startGame', ({ code, questions }) => {
    if (!rooms[code] || rooms[code].host !== socket.id) return;
    rooms[code].started = true;
    rooms[code].questions = questions;
    io.to(code).emit('gameStarted', { questions });
  });

  // Score envoyé par un joueur
  socket.on('sendScore', ({ code, score }) => {
    let room = rooms[code];
    if (!room) return;
    let player = room.players.find(p => p.id === socket.id);
    if (player) player.score = score;
    io.to(code).emit('scoreUpdate', room.players.map(p => ({ name: p.name, score: p.score })));
  });

  // Déconnexion
  socket.on('disconnecting', () => {
    for (let code of socket.rooms) {
      if (rooms[code]) {
        rooms[code].players = rooms[code].players.filter(p => p.id !== socket.id);
        io.to(code).emit('playerList', rooms[code].players);
        if (rooms[code].players.length === 0) delete rooms[code];
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Serveur quiz multi lancé sur http://localhost:${PORT}`);
});
