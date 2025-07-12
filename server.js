const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors'); // <= NE PAS OUBLIER !

const app = express();

app.use(cors({
  origin: "https://lovely-chaja-a4be3a.netlify.app"
}));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "https://lovely-chaja-a4be3a.netlify.app",
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
    rooms[code] = { 
      players: [], 
      host: socket.id, 
      questions: null, 
      started: false,
      currentQuestion: 0 // <-- Ajout
    };
    socket.join(code);
    rooms[code].players.push({ id: socket.id, name: name || "Streamer", score: 0, isHost: true });
    socket.emit('roomCreated', { code });
    io.to(code).emit('playerList', rooms[code].players);
  });

  // Rejoindre une salle (avec reconnexion)
socket.on('joinRoom', ({ code, name }) => {
  if (!rooms[code]) {
    socket.emit('joinError', 'Code inconnu');
    return;
  }

  let existing = rooms[code].players.find(p => p.name === name);

  if (existing) {
    // Reconnexion : on met à jour l'ID
    existing.id = socket.id;
    socket.join(code);
  } else {
    // Partie commencée ? Nouveau joueur interdit
    if (rooms[code].started) {
      socket.emit('joinError', 'Partie déjà commencée (reconnexion uniquement)');
      return;
    }
    // Nouveau joueur accepté (avant début)
    rooms[code].players.push({ id: socket.id, name, score: 0, isHost: false });
    socket.join(code);
  }

  io.to(code).emit('playerList', rooms[code].players);

  if (
  rooms[code].started &&
  Array.isArray(rooms[code].questions) &&
  typeof rooms[code].currentQuestion === 'number' &&
  rooms[code].currentQuestion < rooms[code].questions.length
) {
  const idx = rooms[code].currentQuestion;
const qtab = rooms[code].questions;

if (
  rooms[code].started &&
  Array.isArray(qtab) &&
  typeof idx === 'number' &&
  idx >= 0 &&
  idx < qtab.length &&
  qtab[idx] &&
  typeof qtab[idx].question === 'string' &&
  Array.isArray(qtab[idx].answers) &&
  typeof qtab[idx].correct === 'number'
) {
  socket.emit('joinedRoom', { 
    code, 
    resume: true, 
    questions: qtab,
    currentQuestion: idx
  });
} else {
  socket.emit('joinError', "Impossible de retrouver la question en cours ou la partie.");
}
}
 else {
    socket.emit('joinedRoom', { code });
  }
});

  // Lancement de la partie par le streamer
socket.on('startGame', ({ code, questions }) => {
  if (!rooms[code] || rooms[code].host !== socket.id) return;
  rooms[code].started = true;
  rooms[code].questions = questions;
  rooms[code].currentQuestion = 0;
  io.to(code).emit('gameStarted', { 
    questions,
    currentQuestion: 0,
    question: questions[0]
  });
});

// Passer à la question suivante
socket.on('nextQuestion', ({ code }) => {
  const room = rooms[code];
  if (!room || room.host !== socket.id) return;
  if (room.currentQuestion === undefined) room.currentQuestion = 0;
  if (room.currentQuestion < room.questions.length - 1) {
    room.currentQuestion += 1;
    io.to(code).emit('nextQuestion', {
      questionIndex: room.currentQuestion,
      question: room.questions[room.currentQuestion]
    });
  } else {
    io.to(code).emit('quizFinished');
  }
});

// Nullification
socket.on('nullifyQuestion', ({ code, questionIndex, newQuestion }) => {
  const room = rooms[code];
  if (!room || room.host !== socket.id) return;
  room.questions[questionIndex] = newQuestion;
  io.to(code).emit('questionNullified', { questionIndex, question: newQuestion });
});

// Score
socket.on('sendScore', ({ code, score }) => {
  const room = rooms[code];
  if (!room) return;
  const player = room.players.find(p => p.id === socket.id);
  if (player) player.score = score;
  io.to(code).emit('scoreUpdate', room.players.map(p => ({ name: p.name, score: p.score })));
});

// Déconnexion
socket.on('disconnecting', () => {
  for (let code of socket.rooms) {
    if (rooms[code]) {
      let player = rooms[code].players.find(p => p.id === socket.id);
      if (player) player.id = null;
      io.to(code).emit('playerList', rooms[code].players);
      if (rooms[code].players.length === 0) delete rooms[code];
    }
  }
});
});

server.listen(PORT, () => {
  console.log(`Serveur quiz multi lancé sur http://localhost:${PORT}`);
});
