const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Pour servir tes fichiers HTML
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
  let existing = rooms[code].players.find(p => p.name === name);
  // Si la partie est commencée, seuls les pseudos déjà enregistrés peuvent revenir
  if (rooms[code].started && !existing) {
    socket.emit('joinError', 'Partie déjà commencée (reconnexion uniquement)');
    return;
  }
  // Reconnexion : on met à jour l'id socket
  if (existing) {
    existing.id = socket.id;
  } else {
    // Nouveau joueur
    rooms[code].players.push({ id: socket.id, name, score: 0, isHost: false });
  }
  socket.join(code);
  io.to(code).emit('playerList', rooms[code].players);
  if (rooms[code].started && rooms[code].questions) {
    // On renvoie l'état du jeu pour une reprise immédiate !
    socket.emit('joinedRoom', { code, resume: true, questions: rooms[code].questions });
  } else {
    socket.emit('joinedRoom', { code });
  }
});

  // Lancement de la partie par le streamer
  socket.on('startGame', ({ code, questions }) => {
    if (!rooms[code] || rooms[code].host !== socket.id) return;
    rooms[code].started = true;
    rooms[code].questions = questions;
    io.to(code).emit('gameStarted', { questions });
  });

  // Enregistrement score d’un joueur (après quiz)
  socket.on('sendScore', ({ code, score }) => {
    let room = rooms[code];
    if (!room) return;
    let player = room.players.find(p => p.id === socket.id);
    if (player) player.score = score;
    // Diffuse le classement à tous les joueurs
    io.to(code).emit('scoreUpdate', room.players.map(p => ({ name: p.name, score: p.score })));
  });

  // Déconnexion ou quit
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
