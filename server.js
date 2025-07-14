const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
const { v4: uuidv4 } = require('uuid'); // Pour générer des IDs uniques

// Import de la base de données de questions côté serveur
// Assurez-vous que questiondatabase.js est accessible depuis le serveur
const questionDatabase = require('./questiondatabase');

const app = express();

// It's better to use a whitelist for CORS origins.
// This allows you to support your production frontend and local development environments.
const allowedOrigins = [
  // --- IMPORTANT ---
  // Si frontend est déployé sur un autre service (Vercel, Netlify, etc.),
  // ajouter son URL ici. Par exemple :
  // 'https://mon-quiz-frontend.netlify.app',

  // URL du backend lui-même (si le frontend est servi par ce même serveur)
  // absence de / à la fin, c'est crucial.
  'https://polyquiz-sc.up.railway.app',
  // URLs pour le développement local (le port 3000 correspond à vos fichiers V2/index.html)
  'http://localhost:3000',
  'http://127.0.0.1:3000'
];

// You can still use an environment variable for more flexibility, for example for preview deployments.
if (process.env.CORS_ORIGIN) {
    allowedOrigins.push(process.env.CORS_ORIGIN);
}

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests) or from the whitelist
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ["GET", "POST"]
};

app.use(cors(corsOptions));

// API routes should be defined BEFORE the static middleware.
// This ensures that API requests are handled by their specific routes
// before Express tries to find a static file.
app.get('/difficulties', (req, res) => {
  const difficulties = [...new Set(questionDatabase.map(q => q.difficulty))];
  res.json(difficulties);
});

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: Date.now(),
    uptime: process.uptime()
  });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: corsOptions // Reuse the same CORS options for Socket.IO
});

const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname + '/'));

let rooms = {};
let moderatorSockets = []; // Pour les connexions des modérateurs
const serverStartTime = Date.now(); // Pour calculer l'uptime

// Définir un mot de passe pour les modérateurs via une variable d'environnement
const MODERATOR_PASSWORD = process.env.MODERATOR_PASSWORD || 'violettemodo';
const MAX_LOG_ENTRIES = 50;

/**
 * Ajoute une entrée au journal d'événements d'une salle.
 * @param {string} code Le code de la salle.
 * @param {string} message Le message à enregistrer.
 */
function logToRoom(code, message) {
    if (!rooms[code]) return;
    const room = rooms[code];
    if (!room.eventLog) {
        room.eventLog = [];
    }
    room.eventLog.unshift({ time: new Date().toLocaleTimeString('fr-FR'), message });
    // Limiter la taille du journal pour éviter une consommation mémoire excessive
    if (room.eventLog.length > MAX_LOG_ENTRIES) room.eventLog.pop();
}

// Durée du timer par défaut pour chaque question (en millisecondes)
const DEFAULT_QUESTION_TIMER_DURATION = 20000; // 20 secondes

// Nombre de questions par défaut
const DEFAULT_NUM_QUESTIONS = 20;

// Fonction pour générer un code de salle aléatoire
function randomRoomCode(length = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Removed duplicate "23"
  let code = "";
  for (let i = 0; i < length; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// Fonction pour filtrer et sélectionner les questions côté serveur
function getFilteredQuestions(allQuestions, count = DEFAULT_NUM_QUESTIONS, difficulty = 'normal') {
  let potentialQuestions = allQuestions;

  // 1. Filter by difficulty if a specific one is chosen (and not 'all')
  if (difficulty && difficulty.toLowerCase() !== 'all') {
    potentialQuestions = allQuestions.filter(q => q.difficulty === difficulty);
    console.log(`Filtering for difficulty: ${difficulty}. Found ${potentialQuestions.length} questions.`);
  } else {
    console.log(`No difficulty filter applied. Using all ${potentialQuestions.length} questions.`);
  }

  // 2. Shuffle the potential questions
  const shuffled = [...potentialQuestions].sort(() => Math.random() - 0.5);

  // 3. Check if there are enough questions for the requested count
  if (shuffled.length < count) {
    console.warn(`Not enough unique questions for difficulty '${difficulty}'. Wanted ${count}, got ${shuffled.length}. Returning all available.`);
    return shuffled; // Return all available shuffled questions for that difficulty
  }

  // 4. Slice to the desired count
  const selected = shuffled.slice(0, count);
  return selected;
}

io.on('connection', (socket) => {
  console.log(`Nouvelle connexion: ${socket.id}`);

  socket.on('registerModerator', ({ password }) => {
    if (password === MODERATOR_PASSWORD) {
      console.log(`Socket ${socket.id} enregistré comme modérateur (authentification réussie).`);
      moderatorSockets.push(socket);
      socket.emit('moderatorAuthSuccess'); // Notifier le client du succès
    } else {
      console.log(`Tentative d'authentification modérateur échouée pour le socket ${socket.id}.`);
      socket.emit('moderatorAuthFailed', { message: 'Mot de passe incorrect.' });
      socket.disconnect(); // Déconnecter le socket si le mot de passe est faux
    }
  });

  // Événement pour créer une salle
  socket.on('createRoom', ({ name, avatar, playerId, numQuestions, timePerQuestion, difficulty }) => {
    let code;
    do { code = randomRoomCode(); } while (rooms[code]);
    
    rooms[code] = { 
      players: [], 
      host: socket.id, 
      questions: null, 
      started: false,
      currentQuestionIndex: 0, 
      createdAt: Date.now(),
      questionStartTime: null,
      usedQuestionIds: [], 
      serverTimer: null,
      numQuestionsTotal: numQuestions || DEFAULT_NUM_QUESTIONS, // Stocke le nombre total de questions
      timePerQuestionDuration: (timePerQuestion * 1000) || DEFAULT_QUESTION_TIMER_DURATION, // Stocke le temps par question en ms
      difficulty: difficulty || 'normal', // Stocke la difficulté choisie
      pausedByHostDisconnect: false, // Ajout pour la pause en cas de déconnexion de l'hôte
      eventLog: [] // Initialiser le journal d'événements
    };
    
    socket.join(code);
    rooms[code].players.push({ 
      id: socket.id, 
      playerId: playerId, 
      name: name || "Streamer", 
      score: 0, 
      isHost: true,
      connectedAt: Date.now(),
      avatar: avatar || 1,
      currentQuestionChoice: null, 
      hasAnsweredCurrentQuestion: false 
    });
    
    socket.emit('roomCreated', { code });
    io.to(code).emit('playerList', rooms[code].players);
    logToRoom(code, `Salle créée par ${name}.`);
    console.log(`Salle créée: ${code} par ${name} avec ${numQuestions} questions, ${timePerQuestion}s/question et difficulté '${difficulty}'.`);
  });

  // Événement pour rejoindre une salle
  socket.on('joinRoom', ({ code, name, avatar, playerId }) => {
    console.log(`Tentative de connexion: ${name} (playerId: ${playerId}) -> ${code}`);
    
    if (!rooms[code]) {
      socket.emit('joinError', 'Code de partie inconnu');
      return;
    }

    let room = rooms[code];
    let existingPlayer = room.players.find(p => p.playerId === playerId);

    if (existingPlayer) {
      console.log(`Reconnexion du joueur ${name} (playerId: ${playerId}) dans la partie ${code}`);
      existingPlayer.id = socket.id; 
      existingPlayer.connectedAt = Date.now();
      existingPlayer.disconnectedAt = null;
      existingPlayer.avatar = avatar || existingPlayer.avatar || 1; 
      socket.join(code);

      // Si le joueur qui se reconnecte est l'hôte
      if (existingPlayer.isHost) {
        room.host = socket.id; // **Mise à jour cruciale de l'ID de l'hôte dans la salle**
        console.log(`L'hôte ${name} a repris le contrôle de la salle ${code}. Nouvel ID de socket: ${socket.id}`);
        logToRoom(code, `L'hôte ${name} a repris le contrôle.`);

        // Si la partie était en pause à cause de sa déconnexion, on la reprend
        if (room.pausedByHostDisconnect) {
          room.pausedByHostDisconnect = false;
          room.questionStartTime = Date.now(); // Réinitialiser le timer pour tout le monde
          io.to(code).emit('gameResumedByHost', {
            questionStartTime: room.questionStartTime,
            timerDuration: room.timePerQuestionDuration
          });
          console.log(`Reprise de la partie ${code} après reconnexion de l'hôte.`);
          logToRoom(code, `La partie reprend après la reconnexion de l'hôte.`);
          // Relancer le timer si la partie était démarrée et qu'une question est en cours
          if (room.started && room.currentQuestionIndex < room.numQuestionsTotal) {
            startServerQuestionTimer(code);
          }
        }
      }

      logToRoom(code, `Joueur ${name} s'est reconnecté.`);

      if (room.started && room.questions && typeof room.currentQuestionIndex === 'number') {
        const idx = room.currentQuestionIndex;
        const qtab = room.questions;

        if (qtab && typeof idx === 'number' && idx >= 0 && idx < qtab.length) {
          const questionForClient = { ...qtab[idx] };
          delete questionForClient.correct; 

          const gameState = {
            code,
            resume: true,
            currentQuestionIndex: idx,
            question: questionForClient, 
            playerScore: existingPlayer.score || 0,
            gameState: 'playing',
            isHostPlayer: existingPlayer.isHost || false,
            questionStartTime: room.questionStartTime,
            timerDuration: room.timePerQuestionDuration, 
            numQuestionsTotal: room.numQuestionsTotal,
            isPaused: room.pausedByHostDisconnect // Envoyer l'état de pause
          };
          
          socket.emit('joinedRoom', gameState);
          console.log(`État de partie envoyé pour reconnexion:`, gameState);
        } else {
          socket.emit('joinError', "Impossible de retrouver la question en cours.");
          return;
        }
      } else {
        socket.emit('joinedRoom', { 
          code, 
          isHostPlayer: existingPlayer.isHost || false,
          isPaused: room.pausedByHostDisconnect // Envoyer l'état de pause même si non démarrée
        });
      }
    } else {
      if (room.started) {
        socket.emit('joinError', 'Partie déjà commencée. Seule la reconnexion est autorisée.');
        return;
      }
      
      const newPlayer = {
        id: socket.id, 
        playerId: playerId, 
        name, 
        score: 0, 
        isHost: false,
        connectedAt: Date.now(),
        avatar: avatar || 1,
        currentQuestionChoice: null, 
        hasAnsweredCurrentQuestion: false 
      };
      
      room.players.push(newPlayer);
      socket.join(code);
      socket.emit('joinedRoom', { 
        code, 
        isHostPlayer: false,
        isPaused: room.pausedByHostDisconnect // Envoyer l'état de pause pour le nouveau joueur
      });
      
      console.log(`Nouveau joueur ajouté: ${name} (playerId: ${playerId}) dans ${code}`);
      logToRoom(code, `Nouveau joueur : ${name}.`);
    }

    io.to(code).emit('playerList', room.players);
  });

  // Événement pour lancer la partie
  socket.on('startGame', ({ code }) => { 
    const room = rooms[code];
    if (!room || room.host !== socket.id) {
      console.log(`Tentative de démarrage non autorisée: ${socket.id} pour ${code}`);
      return;
    }
    // Si la partie est en pause par déconnexion hôte, ne pas démarrer
    if (room.pausedByHostDisconnect) {
      console.log(`Tentative de démarrage de partie en pause dans ${code}.`);
      return;
    }
    
    const selectedQuestions = getFilteredQuestions(questionDatabase, room.numQuestionsTotal, room.difficulty); 
    room.questions = selectedQuestions;
    room.usedQuestionIds = selectedQuestions.map(q => q.id); 
    
    room.started = true;
    room.currentQuestionIndex = 0;
    room.startedAt = Date.now();
    room.questionStartTime = Date.now();

    room.players.forEach(p => {
      p.currentQuestionChoice = null;
      p.hasAnsweredCurrentQuestion = false;
    });
    
    const firstQuestionForClient = { ...room.questions[0] };
    delete firstQuestionForClient.correct; 
    
    io.to(code).emit('gameStarted', { 
      currentQuestionIndex: 0,
      question: firstQuestionForClient, 
      questionStartTime: room.questionStartTime,
      timerDuration: room.timePerQuestionDuration, 
      numQuestionsTotal: room.numQuestionsTotal 
    });
    
    console.log(`Partie démarrée dans ${code} avec ${room.questions.length} questions`);
    logToRoom(code, `La partie commence avec ${room.questions.length} questions.`);

    startServerQuestionTimer(code);
  });

  // Fonction pour démarrer le timer côté serveur
  function startServerQuestionTimer(code) {
    const room = rooms[code];
    if (!room || room.pausedByHostDisconnect) return; // Ne pas démarrer le timer si en pause

    if (room.serverTimer) clearTimeout(room.serverTimer); 

    room.serverTimer = setTimeout(() => {
      console.log(`Timer écoulé pour la question ${room.currentQuestionIndex} dans la salle ${code}. Traitement des réponses finales.`);
      
      room.players.forEach(player => {
        if (player.id && !player.hasAnsweredCurrentQuestion) { 
          processPlayerAnswer(code, player.id, room.currentQuestionIndex, player.currentQuestionChoice);
          player.hasAnsweredCurrentQuestion = true; 
        }
      });
      // Le serveur n'appelle plus sendNextQuestion ici. Il attend l'input du streamer.
    }, room.timePerQuestionDuration); 
  }

  // Événement pour la soumission d'une réponse temporaire par un joueur
  socket.on('submitTemporaryAnswer', ({ code, questionIndex, selectedIndex }) => {
    const room = rooms[code];
    // Bloquer si la partie est en pause par déconnexion hôte
    if (!room || room.pausedByHostDisconnect) {
      console.log(`Tentative de soumission temporaire bloquée (partie en pause) dans: ${code}`);
      return;
    }
    const player = room.players.find(p => p.id === socket.id);
    if (!player) {
      console.log(`Joueur non trouvé pour la soumission de réponse temporaire: ${socket.id}`);
      return;
    }

    if (questionIndex !== room.currentQuestionIndex) {
      console.log(`Réponse temporaire pour une question non actuelle: ${player.name} (Q${questionIndex}, actuelle: Q${room.currentQuestionIndex})`);
      return;
    }

    player.currentQuestionChoice = selectedIndex;
    console.log(`Réponse temporaire mise à jour pour ${player.name} sur Q${questionIndex}: ${selectedIndex}`);
  });

  // Événement pour la soumission de la réponse finale par un joueur (déclenchée par le client quand le timer local expire)
  socket.on('submitAnswer', ({ code, questionIndex, selectedIndex }) => {
    const room = rooms[code];
    // Bloquer si la partie est en pause par déconnexion hôte
    if (!room || room.pausedByHostDisconnect) {
      console.log(`Tentative de soumission finale bloquée (partie en pause) dans: ${code}`);
      return;
    }
    const player = room.players.find(p => p.id === socket.id);
    if (!player) {
      console.log(`Joueur non trouvé pour la soumission de réponse finale: ${socket.id}`);
      return;
    }

    if (questionIndex !== room.currentQuestionIndex || player.hasAnsweredCurrentQuestion) {
      console.log(`Réponse finale invalide ou déjà traitée pour ${player.name} (Q${questionIndex}, traitée: ${player.hasAnsweredCurrentQuestion})`);
      return;
    }

    processPlayerAnswer(code, socket.id, questionIndex, selectedIndex);
    player.hasAnsweredCurrentQuestion = true; 
  });


  // Fonction pour traiter la réponse finale d'un joueur (utilisée par le timer ou l'hôte)
  function processPlayerAnswer(code, playerId, questionIndex, selectedIndex) {
    const room = rooms[code];
    if (!room || !room.questions || questionIndex >= room.questions.length) return;

    const player = room.players.find(p => p.id === playerId);
    if (!player) return;

    const currentQuestion = room.questions[questionIndex];
    let isCorrect = false;
    let scoreChange = 0;
    let streakChange = 0;
    let errorsChange = 0;
    let bonus = 0;

    if (selectedIndex !== null && selectedIndex === currentQuestion.correct) {
      isCorrect = true;
      logToRoom(code, `Réponse de ${player.name} : Correcte.`);
      scoreChange = 1;
      streakChange = 1;
      
      const currentStreak = player.streak || 0;
      if ((currentStreak + 1) > 0 && (currentStreak + 1) % 3 === 0) {
        bonus = 1;
        scoreChange += bonus;
        logToRoom(code, `Bonus de série pour ${player.name} ! (+${bonus} pt)`);
      }
    } else {
      isCorrect = false;
      errorsChange = 1;
      streakChange = -(player.streak || 0); 
    }

    if (!isCorrect) logToRoom(code, `Réponse de ${player.name} : Incorrecte.`);
    player.score = (player.score || 0) + scoreChange;
    player.streak = (player.streak || 0) + streakChange;
    player.errors = (player.errors || 0) + errorsChange;
    player.lastScoreUpdate = Date.now();

    console.log(`Score mis à jour pour ${player.name}: +${scoreChange} (Total: ${player.score})`);

    io.to(player.id).emit('answerResult', {
      questionIndex,
      selectedIndex, 
      correctIndex: currentQuestion.correct, 
      isCorrect,
      playerScore: player.score,
      playerErrors: player.errors,
      playerStreak: player.streak,
      bonus: bonus
    });

    const scores = room.players
      .filter(p => p.id !== null)
      .map(p => ({ 
        name: p.name, 
        score: p.score,
        isHost: p.isHost || false,
        avatar: p.avatar || 1
      }));
    io.to(code).emit('scoreUpdate', scores);
  }

  function sendNextQuestion(code) {
    const room = rooms[code];
    if (!room) {
      console.error('❌ Pas de code de room pour envoyer la question suivante');
      return;
    }
    // Bloquer si la partie est en pause par déconnexion hôte
    if (room.pausedByHostDisconnect) {
      console.log(`Tentative de passer à la question suivante bloquée (partie en pause) dans: ${code}`);
      return;
    }
    
    if (room.currentQuestionIndex === undefined) room.currentQuestionIndex = 0;
    
    room.players.forEach(p => {
      p.currentQuestionChoice = null;
      p.hasAnsweredCurrentQuestion = false;
    });

    if (room.currentQuestionIndex < room.questions.length - 1) {
      room.currentQuestionIndex += 1;
      room.questionStartTime = Date.now();
      
      const nextQuestionForClient = { ...room.questions[room.currentQuestionIndex] };
      delete nextQuestionForClient.correct; 
      
      io.to(code).emit('nextQuestion', {
        questionIndex: room.currentQuestionIndex,
        question: nextQuestionForClient, 
        questionStartTime: room.questionStartTime,
        timerDuration: room.timePerQuestionDuration, 
        numQuestionsTotal: room.numQuestionsTotal 
      });
      console.log(`Question suivante dans ${code}: ${room.currentQuestionIndex}/${room.questions.length}`);
      logToRoom(code, `Passage à la question ${room.currentQuestionIndex + 1}/${room.numQuestionsTotal}.`);
      startServerQuestionTimer(code); 
    } else {
      room.started = false;
      room.finishedAt = Date.now();
      if (room.serverTimer) clearTimeout(room.serverTimer);
      const finalScores = room.players
        .map(p => ({ 
          name: p.name, 
          score: p.score,
          isHost: p.isHost || false,
          avatar: p.avatar || 1,
          playerId: p.playerId // Important pour identifier le joueur
        }));
      io.to(code).emit('quizFinished', { scores: finalScores });
      logToRoom(code, `Quiz terminé.`);
      console.log(`Quiz terminé dans ${code}`);
    }
  }

  socket.on('requestNextQuestion', ({ code }) => {
    const room = rooms[code];
    if (!room || room.host !== socket.id) {
      console.log(`Tentative requestNextQuestion non autorisée: ${socket.id} pour ${code}`);
      return;
    }
    // Bloquer si la partie est en pause par déconnexion hôte
    if (room.pausedByHostDisconnect) {
      console.log(`Tentative de requestNextQuestion bloquée (partie en pause) dans: ${code}`);
      return;
    }

    // Clear the automatic timer to prevent it from firing after this manual advancement.
    if (room.serverTimer) {
      clearTimeout(room.serverTimer);
      room.serverTimer = null;
    }

    room.players.forEach(player => {
        if (player.id && !player.hasAnsweredCurrentQuestion) {
            processPlayerAnswer(code, player.id, room.currentQuestionIndex, player.currentQuestionChoice);
            player.hasAnsweredCurrentQuestion = true;
        }
    });
    setTimeout(() => {
        sendNextQuestion(code);
    }, 1000); 
  });

  socket.on('leaveRoom', ({ code }) => {
    if (!rooms[code]) {
        return;
    }
    const room = rooms[code];
    const player = room.players.find(p => p.id === socket.id);

    if (player) {
        // Si l'hôte quitte, la partie est terminée pour tout le monde.
        if (player.isHost) {
            console.log(`L'hôte ${player.name} a mis fin à la partie ${code}. Suppression de la salle.`);
            logToRoom(code, `L'hôte ${player.name} a quitté, la partie est terminée.`);
            io.to(code).emit('hostLeft', { message: "L'hôte a mis fin à la partie." });
            
            // Nettoyer le timer et supprimer la salle
            if (room.serverTimer) {
                clearTimeout(room.serverTimer);
            }
            delete rooms[code];
        } else {
            console.log(`Joueur ${player.name} quitte la salle ${code} manuellement.`);
            logToRoom(code, `Joueur ${player.name} a quitté la partie.`);
            player.id = null;
            player.disconnectedAt = Date.now();
            
            socket.leave(code);
            io.to(code).emit('playerList', room.players);
        }
    }
  });

  socket.on('nullifyQuestion', ({ code, questionIndex }) => { 
    const room = rooms[code];
    if (!room || room.host !== socket.id) {
      console.log(`Tentative nullification non autorisée: ${socket.id} pour ${code}`);
      return;
    }
    // Bloquer si la partie est en pause par déconnexion hôte
    if (room.pausedByHostDisconnect) {
      console.log(`Tentative de nullification bloquée (partie en pause) dans: ${code}`);
      return;
    }
    
    if (questionIndex >= 0 && questionIndex < room.questions.length) {
      let alreadyUsedIds = room.questions.map(q => q.id);
      
      // Filter candidates by difficulty first
      let potentialCandidates = questionDatabase;
      if (room.difficulty && room.difficulty.toLowerCase() !== 'all') {
          potentialCandidates = questionDatabase.filter(q => q.difficulty === room.difficulty);
      }

      // Then filter out already used questions
      let candidates = potentialCandidates.filter(qdb => !alreadyUsedIds.includes(qdb.id));
      let newQuestion;

      if (candidates.length > 0) {
        newQuestion = candidates[Math.floor(Math.random() * candidates.length)];
      } else { // Fallback to the same question if no replacements are found
        newQuestion = room.questions[questionIndex]; 
        console.warn(`Plus de nouvelles questions disponibles pour nullifier dans ${code}.`);
      }

      room.questions[questionIndex] = newQuestion; 

      room.players.forEach(p => {
        p.currentQuestionChoice = null;
        p.hasAnsweredCurrentQuestion = false;
      });
      
      room.questionStartTime = Date.now();
      
      const newQuestionForClient = { ...newQuestion };
      delete newQuestionForClient.correct; 
      
      io.to(code).emit('questionNullified', { 
        questionIndex, 
        question: newQuestionForClient, 
        questionStartTime: room.questionStartTime,
        timerDuration: room.timePerQuestionDuration, 
        numQuestionsTotal: room.numQuestionsTotal 
      });
      console.log(`Question nullifiée dans ${code} à l'index ${questionIndex}. Nouvelle question ID: ${newQuestion.id}`);
      logToRoom(code, `L'hôte a nullifié la question ${questionIndex + 1}.`);
      startServerQuestionTimer(code); 
    }
  });

  socket.on('disconnecting', () => {
    console.log(`Déconnexion du socket ${socket.id}`);
    
    for (let code of socket.rooms) {
      if (rooms[code]) {
        let room = rooms[code];
        let player = room.players.find(p => p.id === socket.id);
        if (player) {
          // Si l'hôte se déconnecte, mettre la partie en pause
          if (player.isHost) {
            room.pausedByHostDisconnect = true;
            if (room.serverTimer) {
              clearTimeout(room.serverTimer); // Arrêter le timer
              room.serverTimer = null;
            }
            io.to(code).emit('gamePausedByHost', { reason: 'host_disconnected' });
            logToRoom(code, `L'hôte ${player.name} s'est déconnecté. Partie en pause.`);
            console.log(`Hôte ${player.name} déconnecté dans ${code}. Partie mise en pause.`);
          }

          player.id = null; 
          player.disconnectedAt = Date.now();
          if (!player.isHost) logToRoom(code, `Joueur ${player.name} s'est déconnecté.`);
          console.log(`Joueur ${player.name} (playerId: ${player.playerId}) marqué comme déconnecté dans ${code}`);
        }
        
        io.to(code).emit('playerList', room.players);
        
        setTimeout(() => {
          if (rooms[code] && rooms[code].players.every(p => p.id === null)) {
            console.log(`Suppression de la partie vide ${code}`);
            if (rooms[code].serverTimer) clearTimeout(rooms[code].serverTimer); 
            delete rooms[code];
          }
        }, 30000); 
      }
    }
  });

  socket.on('disconnect', (reason) => {
    console.log(`Socket ${socket.id} déconnecté: ${reason}`);
    // Retirer le socket de la liste des modérateurs s'il en était un
    const modIndex = moderatorSockets.findIndex(s => s.id === socket.id);
    if (modIndex !== -1) {
        moderatorSockets.splice(modIndex, 1);
        console.log(`Modérateur ${socket.id} déconnecté.`);
    }
  });

  socket.on('ping', () => {
    socket.emit('pong', { timestamp: Date.now() });
  });
});

// Intervalle pour envoyer les mises à jour aux modérateurs
setInterval(() => {
    if (moderatorSockets.length === 0) return;

    const now = Date.now();
    const statusPayload = {
        rooms: Object.keys(rooms).length,
        players: Object.values(rooms).reduce((total, room) => 
            total + room.players.filter(p => p.id !== null).length, 0
        ),
        uptime: (now - serverStartTime) / 1000,
        roomDetails: Object.entries(rooms).map(([code, room]) => ({
            code: code,
            playerCount: room.players.filter(p => p.id !== null).length,
            started: room.started,
            paused: room.pausedByHostDisconnect,
            currentQuestionIndex: room.currentQuestionIndex,
            questionsTotal: room.numQuestionsTotal,
            players: room.players.map(p => ({ // Envoi de plus de détails
                name: p.name,
                score: p.score,
                errors: p.errors || 0,
                streak: p.streak || 0,
                currentChoice: p.currentQuestionChoice,
                isHost: p.isHost,
                disconnected: p.id === null
            })),
            eventLog: room.eventLog || [] // Ajouter le journal
        }))
    };

    moderatorSockets.forEach(modSocket => modSocket.emit('serverStatusUpdate', statusPayload));
}, 2000); // Envoyer toutes les 2 secondes

setInterval(() => {
  const now = Date.now();
  const TIMEOUT = 5 * 60 * 1000; 
  
  Object.keys(rooms).forEach(code => {
    const room = rooms[code];
    
    const allDisconnected = room.players.every(p => 
      p.id === null && 
      p.disconnectedAt && 
      (now - p.disconnectedAt) > TIMEOUT
    );
    
    // Si la partie est en pause par déconnexion hôte et que l'hôte n'est pas revenu après un certain temps,
    // on peut la considérer comme abandonnée.
    const hostPlayer = room.players.find(p => p.isHost);
    const hostDisconnectedAndTimedOut = hostPlayer && hostPlayer.id === null && room.pausedByHostDisconnect && (now - hostPlayer.disconnectedAt) > TIMEOUT;
    
    const oldUnstarted = !room.started && 
      room.createdAt && 
      (now - room.createdAt) > TIMEOUT;
    
    if (allDisconnected || oldUnstarted || hostDisconnectedAndTimedOut) {
      console.log(`Suppression de la partie abandonnée ${code}`);
      // Pas de logToRoom ici car la salle est sur le point d'être supprimée
      if (room.serverTimer) clearTimeout(room.serverTimer); 
      delete rooms[code];
    }
  });
}, 60000); 

process.on('uncaughtException', (error) => {
  console.error('Erreur non gérée:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Promesse rejetée non gérée:', reason);
});

server.listen(PORT, () => {
  console.log(`Serveur quiz multi lancé sur le port ${PORT}`);
  console.log(`Endpoint de statut disponible sur /status`);
  console.log(`Endpoint de santé disponible sur /health`);
  console.log(`Timer de question par défaut configuré à ${DEFAULT_QUESTION_TIMER_DURATION/1000} secondes`);
});
