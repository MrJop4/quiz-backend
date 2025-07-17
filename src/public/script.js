// ===== VARIABLES GLOBALES =====
let isHost = false;
let currentQuestion = null; // Stocke la question actuelle (sans la bonne réponse)
let currentQuestionIndex = 0;
let score = 0, errors = 0, streak = 0;
let lastScores = null;
let isStreamerMode = true, gameActive = false;
const QUESTIONS_TO_WIN_DEFAULT = 20; // Valeur par défaut si non définie par l'hôte
let questionsToWin = QUESTIONS_TO_WIN_DEFAULT; // Sera mise à jour par le serveur
const TIME_PER_QUESTION_DEFAULT = 20; // Valeur par défaut si non définie par l'hôte
let timePerQuestion = TIME_PER_QUESTION_DEFAULT; // Sera mise à jour par le serveur

const TIME_IMAGE_POPUP = 4000;
const TOTAL_AVATARS = 40;
const socket = io('https://polyquiz-sc.up.railway.app'); // URL serveur (sans / à la fin !)

// Variables pour les timers et l'état du jeu
let timerBarInterval = null, selectedIndex = null; // selectedIndex stocke le choix temporaire du joueur
let imagePopupTimeout = null;
let playerName = "";
let roomCode = "";
let selectedAvatar = 1;
let playerId = ""; // Nouvel identifiant unique du joueur

// ===== DEBUG LOGGING CONTROLS =====
let enableDebugLogs = false;
const SECRET_PHRASE = "violettedebug";
let typedPhraseBuffer = "";
const MAX_BUFFER_LENGTH = SECRET_PHRASE.length;

// Helper function for conditional logging
function logDebug(...args) {
  if (enableDebugLogs) {
    console.log(...args);
  }
}

// Keydown listener for the secret phrase
document.addEventListener('keydown', (event) => {
  // Only listen if not in an input field
  const activeElement = document.activeElement;
  if (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA') {
    return;
  }

  const key = event.key.toLowerCase();

  // Append key to buffer
  typedPhraseBuffer += key;

  // Keep buffer length in check
  if (typedPhraseBuffer.length > MAX_BUFFER_LENGTH) {
    typedPhraseBuffer = typedPhraseBuffer.substring(typedPhraseBuffer.length - MAX_BUFFER_LENGTH);
  }

  // Check if buffer matches secret phrase
  if (typedPhraseBuffer.endsWith(SECRET_PHRASE)) {
    enableDebugLogs = !enableDebugLogs; // Toggle
    typedPhraseBuffer = ""; // Reset buffer
    showCustomAlert(`Mode Débogage ${enableDebugLogs ? 'ACTIVÉ' : 'DÉSACTIVÉ'}`, null, false, 2000); // Temporary alert
    logDebug(`Mode Débogage ${enableDebugLogs ? 'activé' : 'désactivé'}`);
  }
});

// ===== LOADING OVERLAY FUNCTIONS =====
function showLoading(message = 'Chargement...') {
  const overlay = document.getElementById('loading-overlay');
  const msgElement = document.getElementById('loading-message');
  if (msgElement) msgElement.textContent = message;
  if (overlay) overlay.classList.add('visible');
}

function hideLoading() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.classList.remove('visible');
}

// ===== PAUSE OVERLAY FUNCTIONS =====
function showPauseOverlay(message = "L'hôte s'est déconnecté. La partie est en pause...") {
  const overlay = document.getElementById('pause-overlay');
  const msgElement = document.getElementById('pause-message');
  if (msgElement) msgElement.textContent = message;
  if (overlay) overlay.classList.add('visible');
}

function hidePauseOverlay() {
  const overlay = document.getElementById('pause-overlay');
  if (overlay) overlay.classList.remove('visible');
}

// ===== SYSTÈME D'AVATARS =====
function getAvatarPath(avatarId) {
  return `avatar/perso_${avatarId}.png`;
}

function getRandomAvatar() {
  return Math.floor(Math.random() * TOTAL_AVATARS) + 1;
}

function updateAvatarDisplay(containerId = 'avatar-display', imgId = 'avatar-img') {
  const imgElement = document.getElementById(imgId);
  if (imgElement) {
    imgElement.src = getAvatarPath(selectedAvatar);
    
    // Animation de changement
    const container = document.getElementById(containerId);
    if (container) {
      container.style.transform = 'scale(0.9)';
      setTimeout(() => {
        container.style.transform = 'scale(1)';
      }, 150);
    }
  }
}

function setupAvatarSelector(prefix = '') {
  const prevId = prefix + 'avatar-prev';
  const nextId = prefix + 'avatar-next';
  const randomId = prefix + 'avatar-random'; // randomId is defined here, not used directly in the nextBtn.onclick scope.
  const displayId = prefix + 'avatar-display';
  const imgId = prefix + 'avatar-img';

  // Navigation précédent
  const prevBtn = document.getElementById(prevId);
  if (prevBtn) {
    prevBtn.onclick = () => {
      selectedAvatar = selectedAvatar > 1 ? selectedAvatar - 1 : TOTAL_AVATARS;
      updateAvatarDisplay(displayId, imgId);
    };
  }
  
  // Navigation suivant
  const nextBtn = document.getElementById(nextId);
  if (nextBtn) {
    nextBtn.onclick = () => { 
      selectedAvatar = selectedAvatar < TOTAL_AVATARS ? selectedAvatar + 1 : 1; 
      updateAvatarDisplay(displayId, imgId);
    }; 
  }
  
  // Avatar aléatoire
  const randomBtn = document.getElementById(randomId);
  if (randomBtn) {
    randomBtn.onclick = () => {
      selectedAvatar = getRandomAvatar();
      updateAvatarDisplay(displayId, imgId);
    };
  }
}

function createPlayerItemWithAvatar(player) {
  return `
    <li class="player-item">
      <div class="player-avatar ${player.isHost ? 'host' : ''}">
        <img src="${getAvatarPath(player.avatar || 1)}" alt="Avatar ${player.name}">
      </div>
      <div style="flex: 1;">
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          ${player.isHost ? '<span class="score-icon" style="background: gold;">👑</span>' : ''}
          <span>${player.name}</span>
        </div>
        ${player.score !== undefined ? `<div style="font-size: 0.9em; color: var(--text-secondary);">Score: ${player.score}</div>` : ''}
      </div>
    </li>
  `;
}

// ===== GESTION DE LA CONNEXION =====
socket.on('connect', () => {
  logDebug('Socket connecté avec ID:', socket.id);
  
  const isOnHomePage = document.getElementById('lobby-choice').style.display !== "none";
  
  if (isOnHomePage) {
    clearSessionData();
    // Générer un nouvel ID de joueur si on est sur la page d'accueil
    playerId = localStorage.getItem('quiz_playerId') || uuid.v4(); // Utilisation correcte de uuid.v4()
    localStorage.setItem('quiz_playerId', playerId);
    logDebug('Page d\'accueil détectée, données de session nettoyées et nouveau playerId:', playerId);
  } else {
    logDebug('Tentative de reconnexion automatique...');
    attemptReconnection();
  }
});

function attemptReconnection() {
  const savedRoomCode = localStorage.getItem('quiz_roomCode');
  const savedPlayerName = localStorage.getItem('quiz_playerName');
  const savedPlayerId = localStorage.getItem('quiz_playerId');
  const savedAvatar = localStorage.getItem('quiz_selectedAvatar');
  
  if (savedRoomCode && savedPlayerName && savedPlayerId) {
    logDebug('Reconnexion automatique avec:', { savedRoomCode, savedPlayerName, savedPlayerId, savedAvatar });
    showNetworkStatus(false, "Reconnexion en cours...");
    showLoading('Reconnexion en cours...');
    
    roomCode = savedRoomCode;
    playerName = savedPlayerName;
    playerId = savedPlayerId;
    if (savedAvatar) {
      selectedAvatar = parseInt(savedAvatar) || 1;
    }
    
    socket.emit('joinRoom', { 
      code: roomCode, 
      name: playerName,
      avatar: selectedAvatar,
      playerId: playerId // Envoyer le playerId pour la reconnexion
    });
  } else {
    logDebug('Pas de données de session pour la reconnexion');
    // Si pas de données de session pour reconnexion, s'assurer que le playerId est généré
    playerId = uuid.v4(); // Utilisation correcte de uuid.v4()
    localStorage.setItem('quiz_playerId', playerId);
  }
}

function showNetworkStatus(connected, customMessage = null) {
  let id = 'network-status-banner';
  let old = document.getElementById(id);
  if (old) old.remove();
  
  if (!connected || customMessage) {
    let div = document.createElement('div');
    div.id = id;
    div.textContent = customMessage || "Connexion perdue… tentative de reconnexion en cours.";
    div.style = `
      position:fixed;top:16px;left:50%;transform:translateX(-50%);
      background:${connected ? '#10b981' : '#ef4444'};
      padding:16px 38px;border-radius:18px;color:#fff;
      font-size:1.3em;z-index:10000;
      box-shadow:0 2px 16px ${connected ? '#10b981' : '#ef4444'}b0;
      transition:all 0.3s ease;
    `;
    document.body.appendChild(div);
    
    if (connected && customMessage) {
      setTimeout(() => { if(div) div.remove(); }, 2000);
    }
  }
}

socket.on('disconnect', () => {
  logDebug('Socket déconnecté');
  showNetworkStatus(false);
  hideLoading(); // Cacher le chargement en cas de déconnexion
});

socket.io.on('reconnect', (attempt) => {
  logDebug('Reconnexion réussie après', attempt, 'tentatives');
  showNetworkStatus(true, "Reconnexion réussie !");
  attemptReconnection();
});

// ===== SAUVEGARDE DES DONNÉES =====
function saveSessionInfo() {
  if (roomCode && playerName && playerId) {
    localStorage.setItem('quiz_roomCode', roomCode);
    localStorage.setItem('quiz_playerName', playerName);
    localStorage.setItem('quiz_selectedAvatar', selectedAvatar.toString());
    localStorage.setItem('quiz_isHost', isHost.toString());
    localStorage.setItem('quiz_gameActive', gameActive.toString());
    localStorage.setItem('quiz_playerId', playerId); // Sauvegarder le playerId
    logDebug('Données de session sauvegardées:', { roomCode, playerName, selectedAvatar, isHost, gameActive, playerId });
  }
}

function clearSessionData() {
  localStorage.removeItem('quiz_roomCode');
  localStorage.removeItem('quiz_playerName');
  localStorage.removeItem('quiz_selectedAvatar');
  localStorage.removeItem('quiz_isHost');
  localStorage.removeItem('quiz_gameActive');
  // Ne pas supprimer le playerId ici, il est persistant pour la reconnexion
  logDebug('Données de session nettoyées (sauf playerId)');
}

// ===== GESTION DES BOUTONS PRINCIPAUX =====
document.getElementById('btn-create-room').onclick = function() {
  isHost = true;
  selectedAvatar = getRandomAvatar();
  document.getElementById('lobby-choice').style.display = "none";
  document.getElementById('host-avatar-selection').style.display = "flex";
  updateAvatarDisplay('host-avatar-display', 'host-avatar-img');
  setupAvatarSelector('host-');
};

document.getElementById('btn-join-room').onclick = function() {
  isHost = false;
  selectedAvatar = getRandomAvatar();
  document.getElementById('lobby-choice').style.display = "none";
  document.getElementById('join-room-panel').style.display = "flex";
  updateAvatarDisplay();
  setupAvatarSelector();
};

document.getElementById('btn-moderator').onclick = function() {
    window.open('moderator.html', '_blank');
};

document.getElementById('confirm-host-avatar').onclick = function() {
  playerName = document.getElementById('host-name-input').value.trim() || "Streamer";
  
  // Récupérer les paramètres de partie
  const numQuestionsInput = document.getElementById('input-num-questions');
  const timePerQuestionInput = document.getElementById('input-time-per-question');
  const difficultyInput = document.getElementById('input-difficulty');
  
  let numQuestions = parseInt(numQuestionsInput.value);
  let timePerQuestion = parseInt(timePerQuestionInput.value);

  // Validation des inputs
  if (isNaN(numQuestions) || numQuestions < 5 || numQuestions > 50) {
    showCustomAlert("Le nombre de questions doit être entre 5 et 50.");
    return;
  }
  if (isNaN(timePerQuestion) || timePerQuestion < 10 || timePerQuestion > 60) {
    showCustomAlert("Le temps par question doit être entre 10 et 60 secondes.");
    return;
  }

  const selectedDifficulty = difficultyInput.value;

  showLoading('Création de la partie...');
  socket.emit('createRoom', { 
    name: playerName,
    avatar: selectedAvatar,
    playerId: playerId, // Envoyer le playerId
    numQuestions: numQuestions, // Envoyer le nombre de questions
    timePerQuestion: timePerQuestion, // Envoyer le temps par question
    difficulty: selectedDifficulty // Envoyer la difficulté
  });
  saveSessionInfo();
};

document.getElementById('back-to-menu').onclick = function() {
  window.location.reload();
};

// ===== ÉVÉNEMENTS SOCKET =====
socket.on('roomCreated', ({ code }) => {
  hideLoading();
  roomCode = code;
  document.getElementById('host-avatar-selection').style.display = "none";
  document.getElementById('create-room-panel').style.display = "flex";
  document.getElementById('room-code').textContent = code;
  
  // Initialiser la liste avec le host et le compteur
  document.getElementById('room-players').innerHTML = createPlayerItemWithAvatar({
    name: playerName,
    isHost: true,
    avatar: selectedAvatar
  });
  
  // Initialiser le compteur à 1 (le host)
  const playerCountElement = document.getElementById('player-count');
  if (playerCountElement) {
    playerCountElement.textContent = '1';
  }
  
  saveSessionInfo();
});

socket.on('playerList', players => {
  let html = "";
  players.forEach(p => {
    html += createPlayerItemWithAvatar(p);
  });
  document.getElementById('room-players').innerHTML = html;
  
  // Mettre à jour le compteur de joueurs
  const playerCountElement = document.getElementById('player-count');
  if (playerCountElement) {
    const count = players.filter(p => p.id !== null).length; // Compter uniquement les connectés
    playerCountElement.textContent = count;
    
    // Animation du compteur quand le nombre change
    playerCountElement.style.transform = 'scale(1.2)';
    playerCountElement.style.background = count > 1 ? 
      'linear-gradient(45deg, var(--success), var(--primary))' : 
      'linear-gradient(45deg, var(--primary), var(--accent))';
    
    setTimeout(() => {
      playerCountElement.style.transform = 'scale(1)';
    }, 200);
    
    // Couleur selon le nombre de joueurs
    const counterContainer = playerCountElement.parentElement;
    if (counterContainer) {
      if (count >= 5) {
        counterContainer.style.borderColor = 'var(--success)';
        counterContainer.style.boxShadow = 'var(--glow) rgba(16, 185, 129, 0.3)';
      } else if (count >= 3) {
        counterContainer.style.borderColor = 'var(--warning)';
        counterContainer.style.boxShadow = 'var(--glow) rgba(245, 158, 11, 0.3)';
      } else {
        counterContainer.style.borderColor = 'var(--border)';
        counterContainer.style.boxShadow = 'none';
      }
    }
  }
});

document.getElementById('btn-join-room-validate').onclick = function() {
  roomCode = document.getElementById('input-room-code').value.trim().toUpperCase();
  playerName = document.getElementById('input-player-name').value.trim();
  let errorDiv = document.getElementById('join-error');
  
  if (!/^[A-Z0-9]{4,8}$/.test(roomCode)) {
    errorDiv.textContent = "Code invalide.";
    errorDiv.style.display = "block";
    return;
  }
  if (!playerName) {
    errorDiv.textContent = "Pseudo obligatoire.";
    errorDiv.style.display = "block";
    return;
  }
  
  errorDiv.style.display = "none";
  showLoading('Rejoindre la partie...');
  socket.emit('joinRoom', { 
    code: roomCode, 
    name: playerName,
    avatar: selectedAvatar,
    playerId: playerId // Envoyer le playerId
  });
  saveSessionInfo();
};

socket.on('joinError', msg => {
  hideLoading();
  console.error('Erreur de rejoindre:', msg);
  
  // Utiliser une boîte de dialogue personnalisée au lieu de `confirm`
  showCustomAlert(`Erreur: ${msg}\n\nVoulez-vous retourner au menu principal ?`, (result) => {
    if (result) { // Si l'utilisateur clique sur "Oui"
      clearSessionData();
      retourMenu();
      showNetworkStatus(true, "Retour au menu principal");
    } else {
      // L'utilisateur a choisi de ne pas retourner au menu
      document.getElementById('join-error').textContent = msg;
      document.getElementById('join-error').style.display = "block";
      document.getElementById('lobby-choice').style.display = "none";
      document.getElementById('join-room-panel').style.display = "flex";
    }
  }, true); // Le `true` indique qu'il s'agit d'une alerte de confirmation
});

socket.on('joinedRoom', ({ code, resume, currentQuestionIndex: serverQuestionIndex, question, playerScore, gameState, isHostPlayer, questionStartTime, timerDuration, numQuestionsTotal, isPaused }) => {
  hideLoading();
  roomCode = code;
  
  if (typeof isHostPlayer === 'boolean') {
    isHost = isHostPlayer;
  }

  if (!isHost) {
    showWaitForStreamerScreen();
    document.getElementById('main-ui').style.display = "none";
    document.getElementById('multiplayer-lobby').style.display = "none";
  } else {
    document.getElementById('create-room-panel').style.display = "flex";
    document.getElementById('main-ui').style.display = "none";
    document.getElementById('multiplayer-lobby').style.display = "none";
  }

  // Si la partie est en pause à la connexion, afficher l'overlay
  if (isPaused) {
    showPauseOverlay();
  }

  if (resume && typeof serverQuestionIndex === 'number' && question) {
    logDebug('🔄 Reprise de partie détectée:', { serverQuestionIndex, playerScore });
    
    hideWaitForStreamerScreen();
    currentQuestion = question; // La question actuelle (sans la bonne réponse)
    currentQuestionIndex = serverQuestionIndex;
    
    if (typeof playerScore === 'number') {
      score = playerScore;
    } else {
      score = 0;
    }
    
    streak = 0; // Réinitialiser le streak à la reconnexion pour éviter les abus
    errors = 0; // Réinitialiser les erreurs
    gameActive = true;
    isStreamerMode = true; // Toujours en mode streamer pour le client joueur

    // Mettre à jour les paramètres de la partie
    questionsToWin = numQuestionsTotal || QUESTIONS_TO_WIN_DEFAULT;
    timePerQuestion = (timerDuration / 1000) || TIME_PER_QUESTION_DEFAULT;
    
    document.getElementById('multiplayer-lobby').style.display = "none";
    document.getElementById('main-ui').style.display = "";
    
    logDebug('🔄 État restauré:', { score, errors, streak, currentQuestionIndex, questionsToWin, timePerQuestion });
    
    setupGameEventListeners(); // Remettre en place TOUS les event listeners nécessaires
    
    showImageThenQuestion(questionStartTime, timerDuration);
    
    showNetworkStatus(true, "Partie reprise avec succès !");
  } else {
    setupGameEventListeners(); // Aussi remettre les listeners pour les nouvelles parties
    saveSessionInfo();
  }
}); 

// NOUVEAU: Fonction centralisée pour configurer tous les event listeners du jeu
function setupGameEventListeners() {
  // Supprimer les anciens listeners pour éviter les doublons
  socket.off('nextQuestion');
  socket.off('questionNullified');
  socket.off('quizFinished');
  socket.off('scoreUpdate');
  socket.off('answerResult'); // Nouveau listener
  socket.off('hostChanged');
  socket.off('hostLeft'); // NOUVEAU: Gérer le départ de l'hôte
  socket.off('gamePausedByHost');
  socket.off('gameResumedByHost');

  // Remettre en place tous les listeners nécessaires
  socket.on('nextQuestion', ({ questionIndex, question, questionStartTime, timerDuration, numQuestionsTotal }) => {
    hideLoading(); // Cacher le chargement après le passage à la question suivante
    logDebug('📨 Événement nextQuestion reçu:', { questionIndex, questionStartTime });
    currentQuestionIndex = questionIndex;
    currentQuestion = question; // La question sans la bonne réponse
    questionsToWin = numQuestionsTotal || QUESTIONS_TO_WIN_DEFAULT; // Mettre à jour le total
    timePerQuestion = (timerDuration / 1000) || TIME_PER_QUESTION_DEFAULT;
    showImageThenQuestion(questionStartTime, timerDuration);
  });
  
  socket.on('questionNullified', ({ questionIndex, question, questionStartTime, timerDuration, numQuestionsTotal }) => {
    hideLoading(); // Cacher le chargement après nullification
    logDebug('📨 Événement questionNullified reçu:', { questionIndex, questionStartTime });
    // Mettre à jour la question actuelle si c'est celle qui a été nullifiée
    if (currentQuestionIndex === questionIndex) {
      currentQuestion = question;
      questionsToWin = numQuestionsTotal || QUESTIONS_TO_WIN_DEFAULT; // Mettre à jour le total
      timePerQuestion = (timerDuration / 1000) || TIME_PER_QUESTION_DEFAULT;
      showImageThenQuestion(questionStartTime, timerDuration);
    }
  });
  
  socket.on('quizFinished', ({ scores }) => {
    hideLoading();
    logDebug('📨 Événement quizFinished reçu');
    gameActive = false;
    endGame(scores);
  });
  
  socket.on('scoreUpdate', scores => {
    logDebug('📨 Événement scoreUpdate reçu:', scores);
    lastScores = scores;
    // Mettre à jour le score du joueur localement si la mise à jour vient du serveur
    const myPlayerScore = scores.find(p => p.name === playerName); // Assumant que le nom est unique
    if (myPlayerScore) {
      score = myPlayerScore.score;
      // Les erreurs et streak sont mis à jour via 'answerResult'
      updateScoreDisplay();
    }
  });

  // NOUVEAU: Gérer le résultat de la réponse du serveur
  socket.on('answerResult', ({ questionIndex, selectedIndex: playerSelectedIndex, correctIndex, isCorrect, playerScore, playerErrors, playerStreak, bonus }) => {
    hideLoading(); // Cacher le chargement après réception du résultat de réponse
    logDebug('📨 Événement answerResult reçu:', { questionIndex, playerSelectedIndex, correctIndex, isCorrect, playerScore, playerErrors, playerStreak, bonus });
    // Mettre à jour les scores locaux avec les valeurs du serveur
    score = playerScore;
    errors = playerErrors;
    streak = playerStreak;
    
    // Afficher la correction visuelle
    showCorrection(playerSelectedIndex, correctIndex, isCorrect, bonus);
  });

  // NOUVEAU: Gérer le changement d'hôte
  socket.on('hostChanged', ({ newHostName, newHostId, newHostPlayerId }) => {
    logDebug(`📨 Événement hostChanged reçu: Nouvel hôte est ${newHostName}`);
    if (playerId === newHostPlayerId) {
      isHost = true;
      showCustomAlert(`Félicitations ! Vous êtes le nouvel hôte de la partie.`, () => {
        // Optionnel: Rediriger ou rafraîchir pour que l'interface hôte s'active
        // window.location.reload(); 
        // Pour l'instant, on laisse le joueur continuer, mais il peut maintenant voir les boutons hôtes
      });
    } else {
      showCustomAlert(`L'hôte a changé. Le nouvel hôte est ${newHostName}.`);
    }
  });
  
  // NOUVEAU: Gérer le départ de l'hôte qui met fin à la partie
  socket.on('hostLeft', ({ message }) => {
    logDebug('🚪 L\'hôte a quitté, fin de la partie.');
    gameActive = false; // Arrêter toute activité de jeu
    if(timerBarInterval) clearTimeout(timerBarInterval); // Arrêter les timers
    showCustomAlert(message + "\n\nVous allez être redirigé vers l'accueil.", () => {
      retourMenu();
    });
  });

  // NOUVEAU: Gérer la pause et la reprise de la partie par l'hôte
  socket.on('gamePausedByHost', ({ reason }) => {
    logDebug(`🔌 Partie mise en pause par l'hôte: ${reason}`);
    showPauseOverlay("L'hôte s'est déconnecté. La partie est en pause...");
  });

  socket.on('gameResumedByHost', ({ questionStartTime, timerDuration }) => {
    logDebug("▶️ Reprise de la partie par l'hôte.");
    hidePauseOverlay();
    showNetworkStatus(true, "L'hôte est de retour, la partie reprend !");

    if (gameActive && document.getElementById('timer-bar')) {
      startTimerBar(questionStartTime, timerDuration);
    }
  });
  
  logDebug('🔧 Event listeners du jeu configurés');
}

// ===== FONCTIONS DE JEU =====
function updateScoreDisplay() {
  const scoreEl = document.getElementById('score-value');
  const errorsEl = document.getElementById('errors-value');
  const streakEl = document.getElementById('streak-value');
  
  if (scoreEl) {
    scoreEl.textContent = score;
    logDebug('📊 Score affiché:', score);
  }
  if (errorsEl) {
    errorsEl.textContent = errors;
    logDebug('📊 Erreurs affichées:', errors);
  }
  if (streakEl) {
    streakEl.textContent = streak;
    logDebug('📊 Streak affiché:', streak);
  }
}

function showAnswerFeedback(selectedIndex) {
  const oldFeedback = document.getElementById('answer-feedback');
  if (oldFeedback) oldFeedback.remove();
  
  const feedback = document.createElement('div');
  feedback.id = 'answer-feedback';
  feedback.style = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: rgba(0, 212, 255, 0.9);
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    font-weight: 600;
    font-size: 1.1em;
    z-index: 9999;
    box-shadow: 0 4px 12px rgba(0, 212, 255, 0.3);
    animation: slideInRight 0.3s ease-out;
  `;
  
  feedback.innerHTML = `
    ✓ Réponse ${String.fromCharCode(65 + selectedIndex)} sélectionnée
    <div style="font-size: 0.85em; margin-top: 4px; opacity: 0.8;">
      En attente de la fin du temps...
    </div>
  `;
  
  document.body.appendChild(feedback);
  
  // Le feedback sera retiré quand la correction sera affichée
}

function enhanceAnswerButtons() {
  const answersContainer = document.getElementById('answers-container');
  if (!answersContainer) return;
  
  const buttons = answersContainer.querySelectorAll('.answer-btn');
  buttons.forEach((btn, index) => {
    const letter = String.fromCharCode(65 + index);
    const badge = document.createElement('span');
    badge.className = 'answer-badge';
    badge.textContent = letter;
    btn.style.position = 'relative';
    btn.appendChild(badge);
  });
}

function retourMenu() {
  gameActive = false;
  currentQuestion = null;
  currentQuestionIndex = 0;
  score = 0;
  errors = 0;
  streak = 0;
  selectedIndex = null; // Réinitialiser le choix local
  questionsToWin = QUESTIONS_TO_WIN_DEFAULT; // Réinitialiser à la valeur par défaut
  timePerQuestion = TIME_PER_QUESTION_DEFAULT; // Réinitialiser à la valeur par défaut
  
  if(timerBarInterval) clearTimeout(timerBarInterval);
  if(imagePopupTimeout) clearTimeout(imagePopupTimeout);
  
  //S'assurer que le pop-up de feedback de réponse est bien supprimé
  const feedback = document.getElementById('answer-feedback');
  if (feedback) feedback.remove();

  clearSessionData();
  
  document.getElementById('main-ui').style.display = "none";
  document.getElementById('multiplayer-lobby').style.display = "flex";
  document.getElementById('create-room-panel').style.display = "none";
  document.getElementById('join-room-panel').style.display = "none";
  document.getElementById('host-avatar-selection').style.display = "none";
  document.getElementById('lobby-choice').style.display = "flex";
  
  hideWaitForStreamerScreen();
  hidePauseOverlay(); // S'assurer que l'overlay de pause est masqué
  hideLoading(); // S'assurer que l'overlay de chargement est masqué
  
  logDebug('Retour au menu principal effectué');
}

document.getElementById('btn-start-game').onclick = function() {
  showLoading('Démarrage de la partie...');
  // Le client ne sélectionne plus les questions, le serveur le fait
  socket.emit('startGame', { code: roomCode });
  gameActive = true;
  saveSessionInfo();
};

socket.on('gameStarted', ({ currentQuestionIndex: serverQuestionIndex, question, questionStartTime, timerDuration, numQuestionsTotal }) => {
  hideLoading();
  hideWaitForStreamerScreen(); // S'assurer que l'écran d'attente est masqué
  currentQuestion = question; // La question sans la bonne réponse
  currentQuestionIndex = serverQuestionIndex;
  questionsToWin = numQuestionsTotal || QUESTIONS_TO_WIN_DEFAULT; // Mettre à jour le total
  timePerQuestion = (timerDuration / 1000) || TIME_PER_QUESTION_DEFAULT; // Mettre à jour le temps par question
  preloadImages([question]); // Précharger uniquement l'image de la première question
  document.getElementById('multiplayer-lobby').style.display = "none";
  document.getElementById('main-ui').style.display = "";
  isStreamerMode = true; // Toujours en mode streamer pour le client joueur
  gameActive = true;
  
  setupGameEventListeners(); // Configurer les listeners dès le début de partie
  
  saveSessionInfo();
  launchQuizDirectStreamer(question, questionStartTime, timerDuration);
});

// Fonction pour envoyer la question suivante (déclenchée par l'hôte)
function sendNextQuestion() {
  if (!roomCode) {
    console.error('❌ Pas de code de room pour envoyer la question suivante');
    showCustomAlert('Erreur: Connexion perdue. Veuillez rafraîchir la page.');
    return;
  }
  
  if (!isHost) {
    console.error('❌ Seul l\'host peut envoyer la question suivante');
    return;
  }
  
  showLoading('Passage à la question suivante...');
  logDebug('📤 Envoi de la question suivante depuis room:', roomCode);
  socket.emit('requestNextQuestion', { code: roomCode });
}

function preloadImages(questions) {
  questions.forEach(q => {
    if (q.image) {
      const img = new Image();
      img.src = q.image;
    }
  });
}

function startTimerBar(serverStartTime = null, duration = TIME_PER_QUESTION_DEFAULT * 1000) { // Utilise la valeur par défaut si non fournie
  const DURATION = duration;
  const start = serverStartTime ? new Date(serverStartTime).getTime() : Date.now();
  
  if(timerBarInterval) clearTimeout(timerBarInterval);
  
  function anim() {
    const now = Date.now();
    const elapsed = now - start;
    let percent = Math.max(0, 1 - elapsed / DURATION);
    
    const bar = document.getElementById('timer-bar');
    if (bar) bar.style.width = (percent * 100) + "%";
    
    const label = document.getElementById('timer-label');
    let secLeft = Math.ceil((DURATION - elapsed) / 1000);
    if (label) label.textContent = `Temps restant : ${Math.max(0, secLeft)}s`;
    
    if (elapsed < DURATION && percent > 0) {
      timerBarInterval = setTimeout(anim, 50);
    } else {
      if(bar) bar.style.width = "0%";
      if(label) label.textContent = "Temps écoulé !";
      // Quand le timer client est écoulé, envoyer la réponse finale au serveur
      sendFinalAnswer(); 
    }
  }
  anim();
}

// Nouvelle fonction pour envoyer la réponse finale au serveur
function sendFinalAnswer() {
  if (!gameActive) return; // Ne rien faire si le jeu n'est pas actif

  logDebug('📤 Envoi de la réponse finale au serveur:', selectedIndex);
  socket.emit('submitAnswer', { // Cet événement est maintenant utilisé pour la soumission finale
    code: roomCode,
    questionIndex: currentQuestionIndex,
    selectedIndex: selectedIndex // La dernière réponse sélectionnée ou null
  });

  // Désactiver les boutons de réponse pour cette question après l'envoi final
  let allBtns = [...document.getElementById('answers-container').children];
  allBtns.forEach(b => {
    b.disabled = true;
  });

  const feedback = document.getElementById('answer-feedback');
  if (feedback) feedback.remove(); // Retirer le feedback "En attente..."
}


function launchQuizDirectStreamer(question, questionStartTime = null, timerDuration = null){
  score = 0; // Réinitialiser le score au début du quiz
  errors = 0;
  streak = 0;
  isStreamerMode = true;
  currentQuestion = question; // La première question
  currentQuestionIndex = 0;
  selectedIndex = null; // Réinitialiser le choix local pour la nouvelle question
  
  logDebug('🚀 Lancement du quiz. Variables initiales:', { score, errors, streak });
  
  document.getElementById('quiz-content').innerHTML = "";
  showImageThenQuestion(questionStartTime, timerDuration);
}

function showImageThenQuestion(questionStartTime = null, timerDuration = null) {
  if(imagePopupTimeout) clearTimeout(imagePopupTimeout);

  let q = currentQuestion; // Utiliser la question stockée globalement
  if (!q || !q.question || !Array.isArray(q.answers)) { // Plus besoin de q.correct ici
    showCustomAlert("Erreur critique : question absente ou incomplète. Retour au menu.");
    retourMenu();
    return;
  }

  if (q.image) {
    let imgPopup = document.createElement('div');
    imgPopup.id = "quiz-image-popup";
    imgPopup.style.position = "fixed";
    imgPopup.style.left = "0";
    imgPopup.style.top = "0";
    imgPopup.style.width = "100vw";
    imgPopup.style.height = "100vh";
    imgPopup.style.background = "rgba(18,15,32,0.94)";
    imgPopup.style.zIndex = "99999";
    imgPopup.style.display = "flex";
    imgPopup.style.alignItems = "center";
    imgPopup.style.justifyContent = "center";
    imgPopup.style.flexDirection = "column";
    imgPopup.style.transition = "opacity .35s";
    imgPopup.innerHTML = `
      <img src="${q.image}" alt="Image question"
        style="max-width:92vw;max-height:82vh;display:block;border-radius:32px;box-shadow:0 8px 64px #220066a8,0 1px 16px #fff7;margin:0 auto;"/>
      <div style="margin-top:26px;font-size:2.2em;color:#ffe373;font-weight:900;text-shadow:0 2px 14px #000;letter-spacing:0.04em;">
        Regardez bien cette image&nbsp;!
      </div>
    `;
    document.body.appendChild(imgPopup);
    document.getElementById('main-ui').style.filter = "blur(6px) grayscale(0.37)";
    let oldGameActive = gameActive;
    gameActive = false;
    imagePopupTimeout = setTimeout(() => {
      imgPopup.style.opacity = 0;
      setTimeout(() => {
        if (imgPopup.parentNode) imgPopup.parentNode.removeChild(imgPopup);
        document.getElementById('main-ui').style.filter = "";
        gameActive = oldGameActive;
        showQuestion(questionStartTime, timerDuration);
      }, 330);
    }, 5000);
    return;
  }

  showQuestion(questionStartTime, timerDuration);
}

function showWaitForStreamerScreen() {
  let waitDiv = document.getElementById('waiting-for-streamer');
  if (!waitDiv) {
    waitDiv = document.createElement('div');
    waitDiv.id = 'waiting-for-streamer';
    waitDiv.style = `
      display:flex;
      flex-direction:column;
      align-items:center;
      justify-content:center;
      height:100vh;
      width:100vw;
      position:fixed;
      top:0; left:0;
      background:rgba(10,10,18,0.98);
      z-index:20000;`;
    waitDiv.innerHTML = `
      <div style="font-size:2.7em;color:var(--primary);font-weight:900;margin-bottom:24px;">
        La partie va bientôt commencer&nbsp;!
      </div>
      <div style="color:var(--text-secondary);font-size:1.3em;margin-bottom:32px;">
        Attendez que le streamer lance la partie...
      </div>
      <div style="background:rgba(20,25,32,0.99);border-radius:22px;padding:28px 34px;max-width:600px;text-align:left;box-shadow:0 2px 28px #00d4ff22;margin-bottom:38px;">
        <div style="font-size:1.4em;color:var(--secondary);font-weight:700;margin-bottom:10px;">
          Règles du quiz
        </div>
        <ul style="font-size:1.14em;line-height:1.7;color:#fff7;padding-left:22px;">
          <li>Une seule bonne réponse par question.</li>
          <li>${questionsToWin} questions pour gagner.</li>
          <li>Chaque bonne réponse rapporte 1 point.</li>
          <li>À chaque série de 3 bonnes réponses consécutives : +1 point bonus !</li>
          <li>Le streamer peut annuler une question si elle pose problème.</li>
          <li><strong>Vous pouvez changer de réponse tant que le temps n'est pas écoulé !</strong></li>
        </ul>
      </div>
      <div class="qr-emoji-bounce" style="margin-top:18px;font-size:3em;">⏳</div>
    `;
    document.body.appendChild(waitDiv);
  } else {
    waitDiv.style.display = "flex";
  }
}

function hideWaitForStreamerScreen() {
  let waitDiv = document.getElementById('waiting-for-streamer');
  if (waitDiv) waitDiv.style.display = "none";
}

function showQuestion(questionStartTime = null, timerDuration = null) {
  if(imagePopupTimeout) clearTimeout(imagePopupTimeout);
  selectedIndex = null; // Réinitialiser la sélection pour la nouvelle question
  
  let q = currentQuestion; // Utiliser la question stockée globalement

  if (!q || !q.question || !Array.isArray(q.answers)) {
    showCustomAlert("Erreur critique : question absente ou incomplète (affichage). Retour au menu.");
    retourMenu();
    return;
  }
  
  document.getElementById('quiz-content').innerHTML = `
    <div id="quiz-screen">
      <div class="question-header slide-up">
        <div style="display: flex; align-items: center; gap: 1.5rem;">
          <div class="question-counter" id="question-counter">Question ${currentQuestionIndex+1} / ${questionsToWin}</div>
          <div class="score-display">
            <div class="score-item correct-score">
              <span class="score-icon correct-score">✓</span>
              <span id="score-value">${score}</span>
            </div>
            <div class="score-item wrong-score">
              <span class="score-icon wrong-score">✗</span>
              <span id="errors-value">${errors}</span>
            </div>
            <div class="score-item" style="color:var(--accent);">
              <span class="score-icon" style="background:rgba(124,58,237,0.2);color:var(--accent);">🔥</span>
              <span id="streak-value">${streak}</span>
            </div>
          </div>
        </div>
        <button id="btn-quit-game" class="btn btn-quit">
          Quitter
        </button>
      </div>
      <div class="question-text fade-in" id="question-text">${q.question}</div>
      <div class="timer-container">
        <div class="timer-text" id="timer-label">Temps restant : ${timePerQuestion}s</div>
        <div class="timer-bar-wrapper"><div class="timer-bar" id="timer-bar" style="width: 100%;"></div></div>
      </div>
      <div class="answers-grid" id="answers-container"></div>
      <div id="pause-screen" class="pause-screen" style="display:none"></div>
    </div>
  `;
  
  let answersContainer = document.getElementById('answers-container');
  q.answers.forEach((answer, i) => {
    const btn = document.createElement("button");
    btn.textContent = answer;
    btn.className = "answer-btn slide-up";
    btn.onclick = () => { selectAnswer(btn, i); };
    answersContainer.appendChild(btn);
  });
  
  setTimeout(() => enhanceAnswerButtons(), 100);
  startTimerBar(questionStartTime, timerDuration);

  // Ajouter le listener pour le bouton quitter
  const quitBtn = document.getElementById('btn-quit-game');
  if (quitBtn) {
    quitBtn.onclick = () => {
      showCustomAlert(
        "Êtes-vous sûr de vouloir quitter la partie ? Votre progression sera perdue.",
        (confirmed) => {
          if (confirmed) {
            logDebug('🚪 Le joueur a choisi de quitter la partie.');
            socket.emit('leaveRoom', { code: roomCode });
            retourMenu();
          }
        },
        true // isConfirm = true
      );
    };
  }
  
  logDebug('📋 Question affichée - Changement de réponse autorisé jusqu\'à la fin du timer');
}

function selectAnswer(btn, index) {
  // Permettre de changer de sélection
  selectedIndex = index;
  let allBtns = [...document.getElementById('answers-container').children];
  
  allBtns.forEach(b => {
    b.classList.remove('selected');
    // Ne pas désactiver les boutons ici, pour permettre de changer de réponse
    b.disabled = false; 
  });
  
  btn.classList.add('selected');
  showAnswerFeedback(index);
  
  logDebug('🎯 Réponse sélectionnée temporairement:', index);

  // Envoyer la réponse temporaire au serveur, pour qu'il la stocke
  socket.emit('submitTemporaryAnswer', {
    code: roomCode,
    questionIndex: currentQuestionIndex,
    selectedIndex: index
  });
}

// showCorrection est maintenant appelée par l'événement 'answerResult' du serveur
function showCorrection(playerSelectedIndex, correctIndex, isCorrect, bonus) {
  if(timerBarInterval) clearTimeout(timerBarInterval); // Arrêter le timer visuel
  
  let allBtns = [...document.getElementById('answers-container').children];
  
  allBtns.forEach((btn, i) => {
    btn.classList.remove('selected');
    btn.disabled = true; // S'assurer que les boutons sont désactivés après la correction
    
    if(i === correctIndex) {
      btn.classList.add('correct'); // Marquer la bonne réponse
    }
    // Si le joueur a sélectionné une réponse et qu'elle est fausse
    if(playerSelectedIndex !== null && i === playerSelectedIndex && i !== correctIndex) {
      btn.classList.add('wrong'); // Marquer la mauvaise réponse du joueur
    }
  });

  const feedback = document.getElementById('answer-feedback');
  if (feedback) feedback.remove();

  let scoreMessage = '';
  let streakMessage = '';
  
  if (isCorrect) {
    scoreMessage = `<div style="color:#10b981;font-size:1.3em;font-weight:600;margin:8px 0;">
      ✅ Bonne réponse ! +1 point
    </div>`;
    if (bonus > 0) {
      streakMessage = `<div style="color:#ffd700;font-size:1.5em;font-weight:700;margin:16px 0;text-align:center;">
        🔥 BONUS DE SÉRIE ! +${bonus} point<br>
        <span style="font-size:0.8em;">Série de ${streak} bonnes réponses !</span>
      </div>`;
    }
  } else if (playerSelectedIndex !== null) { // Si une réponse a été soumise mais elle est fausse
    scoreMessage = `<div style="color:#ef4444;font-size:1.3em;font-weight:600;margin:8px 0;">
      ❌ Mauvaise réponse !
    </div>`;
  } else { // Si aucune réponse n'a été soumise (selectedIndex est null)
    scoreMessage = `<div style="color:#f59e0b;font-size:1.3em;font-weight:600;margin:8px 0;">
      ⏰ Temps écoulé ! Pas de réponse donnée.
    </div>`;
  }
  
  updateScoreDisplay(); // Mettre à jour l'affichage du score avec les valeurs du serveur
  
  document.getElementById('pause-screen').style.display = "";
  let html = "";
  
  if(isHost){
    html += `
    <div style="display:flex; flex-direction:column; align-items:center; margin-top:28px;">
      <button onclick="sendNextQuestion()" class="btn" style="margin-bottom:14px;min-width:230px;">Continuer</button>
      <button onclick="nullifyCurrentQuestion()" class="btn btn-secondary nullify-btn"
        style="
          background:#ff6b35;
          color:#fff;
          font-size:1.1em;
          font-weight:700;
          padding:14px 24px;
          border-radius:15px;
          min-width:240px;
          text-align:center;
          margin-top:0;
        ">
        Nullifier la question<br><span style="font-size:0.92em;font-weight:400;">(comme ça les viewers vont arrêter de grogner)</span>
      </button>
    </div>
    `;
  } else {
    // Message pour les joueurs non-hôtes
    html += `
      <div style="font-size:1.5em; color:var(--text-secondary); margin-top:28px; text-align:center;">
        En attente de la prochaine question du streamer...
        <div class="qr-emoji-bounce" style="font-size:2em; margin-top:10px;">⏳</div>
      </div>
    `;
  }
  
  html += scoreMessage + streakMessage;
  document.getElementById('pause-screen').innerHTML = html;
}

function endGame(finalScores){
  gameActive = false;
  if(timerBarInterval) clearTimeout(timerBarInterval);
  
  logDebug('🏁 Fin de partie:', { score, errors, streak, finalScores });

  if (isHost) {
    showHostRanking(finalScores);
  } else {
    showPlayerRanking(finalScores);
  }
}

function showHostRanking(scores) {
  const sortedScores = scores.sort((a,b) => b.score - a.score);
  
  let classementHtml = sortedScores.map((p, i) => {
      const rank = i + 1;
      let rankDisplay;
      if (rank === 1) rankDisplay = '🏆';
      else if (rank === 2) rankDisplay = '🥈';
      else if (rank === 3) rankDisplay = '🥉';
      else rankDisplay = `<b>${rank}.</b>`;

      return `
        <li class="player-item" style="font-size: 1.2em; background: rgba(0,0,0,0.3);">
            <div style="width: 30px; text-align: center; font-weight: 700;">${rankDisplay}</div>
            <div class="player-avatar ${p.isHost ? 'host' : ''}">
                <img src="${getAvatarPath(p.avatar || 1)}" alt="Avatar ${p.name}">
            </div>
            <div style="flex: 1;">${p.name}</div>
            <div style="color: var(--primary); font-weight: 900;">${p.score} pts</div>
        </li>
      `;
    }).join('');

  document.getElementById('quiz-content').innerHTML = `
    <div id="result-screen" style="text-align:center;">
      <h2 style="font-size:3em;color:var(--primary);margin-bottom:24px;">Classement final</h2>
      <ul class="players-list" style="padding: 0; max-height: 50vh; overflow-y: auto;">
        ${classementHtml}
      </ul>
      <button onclick="window.location.reload()" class="btn" style="margin-top:42px;">Nouvelle Partie</button>
    </div>
  `;
}

function showPlayerRanking(scores) {
  const sortedScores = scores.sort((a,b) => b.score - a.score);
  const myIndex = sortedScores.findIndex(p => p.playerId === playerId);

  if (myIndex === -1) {
    showHostRanking(scores); // Fallback si le joueur n'est pas trouvé
    return;
  }

  const myData = sortedScores[myIndex];
  const playerAbove = myIndex > 0 ? sortedScores[myIndex - 1] : null;
  const playerBelow = myIndex < sortedScores.length - 1 ? sortedScores[myIndex + 1] : null;

  const createRankingLine = (player, rank, isMe = false) => {
    if (!player) return '';
    const rankDisplay = rank === 1 ? '🏆' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `<b>${rank}.</b>`;
    return `
      <li class="player-item" style="font-size: 1.2em; background: ${isMe ? 'rgba(0, 212, 255, 0.15)' : 'rgba(0,0,0,0.3)'}; border: ${isMe ? '2px solid var(--primary)' : 'none'}; transform: ${isMe ? 'scale(1.05)' : 'none'};">
          <div style="width: 30px; text-align: center; font-weight: 700;">${rankDisplay}</div>
          <div class="player-avatar ${player.isHost ? 'host' : ''}"><img src="${getAvatarPath(player.avatar || 1)}" alt="Avatar ${player.name}"></div>
          <div style="flex: 1;">${player.name}</div>
          <div style="color: var(--primary); font-weight: 900;">${player.score} pts</div>
      </li>`;
  };

  let rankingHtml = '';
  if (playerAbove) rankingHtml += createRankingLine(playerAbove, myIndex);
  rankingHtml += createRankingLine(myData, myIndex + 1, true);
  if (playerBelow) rankingHtml += createRankingLine(playerBelow, myIndex + 2);

  document.getElementById('quiz-content').innerHTML = `
    <div id="result-screen" style="text-align:center;">
      <h2 style="font-size:2.7em;margin-bottom:18px;color:var(--primary);">Fin du quiz 🏁</h2>
      <div class="question-header" style="margin-bottom:30px;flex-direction:column;gap:1rem;">
        <div style="font-size:2.2em;color:var(--success);"><b>Votre score : ${myData.score} points</b></div>
        <div style="font-size:1.8em;color:var(--text-primary);">Votre classement : ${myIndex + 1} / ${sortedScores.length}</div>
      </div>
      <h3 style="color: var(--text-secondary); margin-bottom: 1rem;">Votre position</h3>
      <ul class="players-list" style="padding: 0;">${rankingHtml}</ul>
    </div>
    <button onclick="window.location.reload()" class="btn" style="margin-top:42px;">Rejouer</button>
  `;
}

// Fonction nullifyCurrentQuestion améliorée (déclenchée par l'hôte)
function nullifyCurrentQuestion() {
  if (!roomCode) {
    console.error('❌ Pas de code de room pour nullifier la question');
    showCustomAlert('Erreur: Connexion perdue. Veuillez rafraîchir la page.');
    return;
  }
  
  if (!isHost) {
    console.error('❌ Seul l\'host peut nullifier une question');
    return;
  }
  
  showLoading('Nullification de la question...');
  // Le client n'a plus besoin de calculer le score ou de trouver une nouvelle question
  // Le serveur gérera la logique de nullification et enverra la nouvelle question
  socket.emit('nullifyQuestion', {
    code: roomCode,
    questionIndex: currentQuestionIndex
  });

  logDebug('📤 Demande de nullification de question envoyée au serveur pour la question:', currentQuestionIndex);
  
  document.getElementById('pause-screen').style.display = "none";
}

// ===== FONCTIONS UTILITAIRES =====
function showCustomAlert(message, callback = null, isConfirm = false, duration = 0) {
  const alertId = 'custom-alert-modal';
  let modal = document.getElementById(alertId);
  if (!modal) {
    modal = document.createElement('div');
    modal.id = alertId;
    modal.style = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100000;
    `;
    modal.innerHTML = `
      <div style="
        background: var(--card-bg);
        border: 1px solid var(--border);
        border-radius: 1rem;
        padding: 2rem;
        max-width: 400px;
        text-align: center;
        box-shadow: var(--glow) rgba(0, 212, 255, 0.2);
      ">
        <p style="font-size: 1.2em; margin-bottom: 1.5rem; color: var(--text-primary);">${message}</p>
        <div style="display: flex; justify-content: center; gap: 1rem;">
          <button id="alert-ok-btn" class="btn">OK</button>
          ${isConfirm ? '<button id="alert-cancel-btn" class="btn btn-secondary">Annuler</button>' : ''}
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('alert-ok-btn').onclick = () => {
      modal.remove();
      if (callback) callback(true);
    };

    if (isConfirm) {
      document.getElementById('alert-cancel-btn').onclick = () => {
        modal.remove();
        if (callback) callback(false);
      };
    }
  } else {
    modal.querySelector('p').textContent = message;
    modal.style.display = 'flex';
    // Gérer les boutons si le type d'alerte change
    const confirmBtn = modal.querySelector('#alert-cancel-btn');
    if (isConfirm && !confirmBtn) {
      const okBtn = modal.querySelector('#alert-ok-btn');
      const newCancelBtn = document.createElement('button');
      newCancelBtn.id = 'alert-cancel-btn';
      newCancelBtn.className = 'btn btn-secondary';
      newCancelBtn.textContent = 'Annuler';
      newCancelBtn.onclick = () => { modal.remove(); if (callback) callback(false); };
      okBtn.parentNode.appendChild(newCancelBtn);
    } else if (!isConfirm && confirmBtn) {
      confirmBtn.remove();
    }
  }

  if (duration > 0 && !isConfirm) { // Auto-fermer si c'est une alerte simple avec durée
    setTimeout(() => {
      if (modal && modal.parentNode) {
        modal.remove();
        if (callback) callback(); // Appeler le callback sans argument pour une alerte simple
      }
    }, duration);
  }
}


// ===== INITIALISATION =====
window.addEventListener('DOMContentLoaded', function() {
  // Pré-remplir les champs s'ils existent en localStorage
  if (localStorage.getItem('quiz_roomCode')) {
    document.getElementById('input-room-code').value = localStorage.getItem('quiz_roomCode');
  }
  if (localStorage.getItem('quiz_playerName')) {
    document.getElementById('input-player-name').value = localStorage.getItem('quiz_playerName');
  }
  if (localStorage.getItem('quiz_selectedAvatar')) {
    selectedAvatar = parseInt(localStorage.getItem('quiz_selectedAvatar')) || 1;
  }
  // Récupérer ou générer le playerId
  playerId = localStorage.getItem('quiz_playerId') || uuid.v4(); // Utilisation correcte de uuid.v4()
  localStorage.setItem('quiz_playerId', playerId);
  
  logDebug('✅ Système d\'avatars initialisé avec', TOTAL_AVATARS, 'avatars disponibles');
  logDebug('✅ Player ID:', playerId);

  // Fetch and populate difficulties for the host
  fetch('/api/difficulties') // Use a relative path to hit the correct API endpoint
    .then(response => response.json())
    .then(difficulties => {
        const difficultySelect = document.getElementById('input-difficulty');
        if (difficultySelect) {
            // The API now returns an array of objects, e.g., [{ id: 'normal', name: 'Normal', ... }]
            difficulties.forEach(difficultyObj => {
                const option = document.createElement('option');
                option.value = difficultyObj.id;
                option.textContent = difficultyObj.name; // Use the pre-formatted name from the API
                difficultySelect.appendChild(option);
            });
        }
    })
    .catch(error => console.error('Error fetching difficulties:', error));
});