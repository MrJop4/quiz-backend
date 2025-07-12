const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');

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
  console.log(`Nouvelle connexion: ${socket.id}`);

  // ✅ CORRECTION 1: Créer une salle
  socket.on('createRoom', ({ name }) => {
    let code;
    do { code = randomRoomCode(); } while (rooms[code]);
    
    rooms[code] = { 
      players: [], 
      host: socket.id, 
      questions: null, 
      started: false,
      currentQuestion: 0,
      createdAt: Date.now() // ✅ Ajout pour le nettoyage automatique
    };
    
    socket.join(code);
    rooms[code].players.push({ 
      id: socket.id, 
      name: name || "Streamer", 
      score: 0, 
      isHost: true,
      connectedAt: Date.now() // ✅ Timestamp de connexion
    });
    
    socket.emit('roomCreated', { code });
    io.to(code).emit('playerList', rooms[code].players);
    console.log(`Salle créée: ${code} par ${name}`);
  });

  // ✅ CORRECTION 2: Rejoindre une salle (gestion reconnexion améliorée)
  socket.on('joinRoom', ({ code, name }) => {
    console.log(`Tentative de connexion: ${name} -> ${code}`);
    
    if (!rooms[code]) {
      socket.emit('joinError', 'Code de partie inconnu');
      return;
    }

    // Recherche du joueur existant (reconnexion ?)
    let existing = rooms[code].players.find(p => p.name === name);

    if (existing) {
      // ✅ Reconnexion confirmée
      console.log(`Reconnexion du joueur ${name} dans la partie ${code}`);
      existing.id = socket.id;
      existing.connectedAt = Date.now(); // ✅ Mise à jour du timestamp
      existing.disconnectedAt = null; // ✅ Effacer le timestamp de déconnexion
      socket.join(code);
      
      // ✅ Envoyer immédiatement l'état de la partie
      if (rooms[code].started && rooms[code].questions && typeof rooms[code].currentQuestion === 'number') {
        const idx = rooms[code].currentQuestion;
        const qtab = rooms[code].questions;

        // Vérification de la validité de la question courante
        if (
          qtab &&
          typeof idx === 'number' &&
          idx >= 0 &&
          idx < qtab.length &&
          qtab[idx] &&
          typeof qtab[idx].question === 'string' &&
          Array.isArray(qtab[idx].answers) &&
          typeof qtab[idx].correct === 'number'
        ) {
          const gameState = {
            code,
            resume: true,
            questions: qtab,
            currentQuestion: idx,
            playerScore: existing.score || 0,
            gameState: 'playing',
            isHostPlayer: existing.isHost || false // ✅ Inclure le statut host
          };
          
          socket.emit('joinedRoom', gameState);
          console.log(`État de partie envoyé pour reconnexion:`, gameState);
        } else {
          socket.emit('joinError', "Impossible de retrouver la question en cours.");
          return;
        }
      } else {
        // Partie pas encore commencée
        socket.emit('joinedRoom', { 
          code, 
          isHostPlayer: existing.isHost || false 
        });
      }
    } else {
      // ✅ Nouveau joueur
      if (rooms[code].started) {
        socket.emit('joinError', 'Partie déjà commencée. Seule la reconnexion est autorisée.');
        return;
      }
      
      // Ajouter le nouveau joueur
      const newPlayer = {
        id: socket.id, 
        name, 
        score: 0, 
        isHost: false,
        connectedAt: Date.now()
      };
      
      rooms[code].players.push(newPlayer);
      socket.join(code);
      socket.emit('joinedRoom', { 
        code, 
        isHostPlayer: false 
      });
      
      console.log(`Nouveau joueur ajouté: ${name} dans ${code}`);
    }

    // ✅ Mise à jour de la liste pour tous
    io.to(code).emit('playerList', rooms[code].players);
  });

  // ✅ CORRECTION 3: Lancement de la partie par le streamer
  socket.on('startGame', ({ code, questions }) => {
    if (!rooms[code] || rooms[code].host !== socket.id) {
      console.log(`Tentative de démarrage non autorisée: ${socket.id} pour ${code}`);
      return;
    }
    
    rooms[code].started = true;
    rooms[code].questions = questions;
    rooms[code].currentQuestion = 0;
    rooms[code].startedAt = Date.now(); // ✅ Timestamp de démarrage
    
    io.to(code).emit('gameStarted', { 
      questions,
      currentQuestion: 0,
      question: questions[0]
    });
    
    console.log(`Partie démarrée dans ${code} avec ${questions.length} questions`);
  });

  // ✅ CORRECTION 4: Passer à la question suivante
  socket.on('nextQuestion', ({ code }) => {
    const room = rooms[code];
    if (!room || room.host !== socket.id) {
      console.log(`Tentative nextQuestion non autorisée: ${socket.id} pour ${code}`);
      return;
    }
    
    if (room.currentQuestion === undefined) room.currentQuestion = 0;
    
    if (room.currentQuestion < room.questions.length - 1) {
      room.currentQuestion += 1;
      io.to(code).emit('nextQuestion', {
        questionIndex: room.currentQuestion,
        question: room.questions[room.currentQuestion]
      });
      console.log(`Question suivante dans ${code}: ${room.currentQuestion}/${room.questions.length}`);
    } else {
      // ✅ Marquer la partie comme terminée
      room.started = false;
      room.finishedAt = Date.now();
      io.to(code).emit('quizFinished');
      console.log(`Quiz terminé dans ${code}`);
    }
  });

  // ✅ CORRECTION 5: Nullification
  socket.on('nullifyQuestion', ({ code, questionIndex, newQuestion }) => {
    const room = rooms[code];
    if (!room || room.host !== socket.id) {
      console.log(`Tentative nullification non autorisée: ${socket.id} pour ${code}`);
      return;
    }
    
    if (questionIndex >= 0 && questionIndex < room.questions.length) {
      room.questions[questionIndex] = newQuestion;
      io.to(code).emit('questionNullified', { 
        questionIndex, 
        question: newQuestion 
      });
      console.log(`Question nullifiée dans ${code} à l'index ${questionIndex}`);
    }
  });

  // ✅ CORRECTION 6: Score avec validation
  socket.on('sendScore', ({ code, score }) => {
    const room = rooms[code];
    if (!room) {
      console.log(`Tentative de mise à jour de score dans une salle inexistante: ${code}`);
      return;
    }
    
    const player = room.players.find(p => p.id === socket.id);
    if (player && typeof score === 'number' && score >= 0) {
      player.score = Math.max(0, Math.floor(score)); // ✅ Validation du score
      player.lastScoreUpdate = Date.now();
      
      // ✅ Envoyer les scores mis à jour
      const scores = room.players
        .filter(p => p.id !== null) // ✅ Exclure les joueurs déconnectés
        .map(p => ({ 
          name: p.name, 
          score: p.score,
          isHost: p.isHost || false
        }));
        
      io.to(code).emit('scoreUpdate', scores);
      console.log(`Score mis à jour pour ${player.name}: ${score}`);
    }
  });

  // ✅ CORRECTION 7: Gestion améliorée des déconnexions
  socket.on('disconnecting', () => {
    console.log(`Déconnexion du socket ${socket.id}`);
    
    for (let code of socket.rooms) {
      if (rooms[code]) {
        let player = rooms[code].players.find(p => p.id === socket.id);
        if (player) {
          // ✅ Marquer comme déconnecté mais ne pas supprimer immédiatement
          player.id = null;
          player.disconnectedAt = Date.now();
          console.log(`Joueur ${player.name} marqué comme déconnecté dans ${code}`);
          
          // ✅ Si c'est l'host qui se déconnecte, gérer la transition
          if (player.isHost && rooms[code].players.length > 1) {
            // Chercher un nouveau host parmi les joueurs connectés
            const newHost = rooms[code].players.find(p => p.id !== null && !p.isHost);
            if (newHost) {
              newHost.isHost = true;
              rooms[code].host = newHost.id;
              console.log(`Nouveau host assigné dans ${code}: ${newHost.name}`);
            }
          }
        }
        
        // ✅ Mettre à jour la liste des joueurs
        io.to(code).emit('playerList', rooms[code].players);
        
        // ✅ Nettoyer les parties vides après un délai (ne pas supprimer immédiatement)
        setTimeout(() => {
          if (rooms[code] && rooms[code].players.every(p => p.id === null)) {
            console.log(`Suppression de la partie vide ${code}`);
            delete rooms[code];
          }
        }, 30000); // 30 secondes de grâce pour la reconnexion
      }
    }
  });

  // ✅ CORRECTION 8: Gestion de la déconnexion complète
  socket.on('disconnect', (reason) => {
    console.log(`Socket ${socket.id} déconnecté: ${reason}`);
  });
});

// ✅ CORRECTION 9: Nettoyage périodique des parties abandonnées
setInterval(() => {
  const now = Date.now();
  const TIMEOUT = 5 * 60 * 1000; // 5 minutes
  
  Object.keys(rooms).forEach(code => {
    const room = rooms[code];
    
    // Supprimer les parties où tous les joueurs sont déconnectés depuis longtemps
    const allDisconnected = room.players.every(p => 
      p.id === null && 
      p.disconnectedAt && 
      (now - p.disconnectedAt) > TIMEOUT
    );
    
    // Ou supprimer les parties très anciennes non démarrées
    const oldUnstarted = !room.started && 
      room.createdAt && 
      (now - room.createdAt) > TIMEOUT;
    
    if (allDisconnected || oldUnstarted) {
      console.log(`Suppression de la partie abandonnée ${code}`);
      delete rooms[code];
    }
  });
}, 60000); // Vérification toutes les minutes

// ✅ CORRECTION 10: Endpoint de statut pour monitoring
app.get('/status', (req, res) => {
  const stats = {
    rooms: Object.keys(rooms).length,
    players: Object.values(rooms).reduce((total, room) => 
      total + room.players.filter(p => p.id !== null).length, 0
    ),
    activeGames: Object.values(rooms).filter(room => room.started).length,
    uptime: process.uptime()
  };
  
  res.json(stats);
});

server.listen(PORT, () => {
  console.log(`Serveur quiz multi lancé sur le port ${PORT}`);
  console.log(`Endpoint de statut disponible sur /status`);
});