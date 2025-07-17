const { v4: uuidv4 } = require('uuid');
const quizService = require('./quiz.service');

//in-memory "database" for active games
const games = {};

/**
 * Creates a new question object without the 'correctAnswer' property.
 * @param {object} question The original question object.
 * @returns {object} The sanitized question.
 */
const sanitizeQuestion = (question) => {
  if (!question) return null;
  const { correctAnswer, ...sanitized } = question;
  return sanitized;
};
const createGame = (hostId, difficulty) => {
  const gameId = uuidv4().substring(0, 5).toUpperCase(); // "user-friendly" ID
  const difficulties = quizService.getAvailableDifficulties();
  const selectedDifficulty = difficulties.find(d => d.id === difficulty);

  if (!selectedDifficulty) {
    throw new Error('Invalid difficulty selected');
  }

  const questions = quizService.getQuestionsForDifficulty(
    difficulty,
    selectedDifficulty.questions
  );

  const newGame = {
    id: gameId,
    hostId: hostId,
    players: {},
    questions: questions,
    currentQuestionIndex: 0,
    state: 'lobby', // States: lobby, playing, finished
    difficulty: difficulty,
  };

  games[gameId] = newGame;
  console.log(`[Game Service] New game created: ${gameId}`);
  return newGame;
};

const getGame = (gameId) => {
  return games[gameId];
};

const addPlayer = (gameId, socketId, playerData) => {
  const game = getGame(gameId);
  if (!game) {
    throw new Error('Game not found');
  }

  // possibility to add more validation here (e.g., max players)

  game.players[socketId] = {
    id: socketId,
    name: playerData.name,
    avatar: playerData.avatar,
    ship: playerData.ship,
    score: 0,
  };

  console.log(`[Game Service] Player ${playerData.name} added to game ${gameId}`);
  return game;
};

const removePlayer = (gameId, socketId) => {
  const game = getGame(gameId);
  if (!game || !game.players[socketId]) {
    return null;
  }
  console.log(`[Game Service] Player ${game.players[socketId].name} removed from game ${gameId}`);
  delete game.players[socketId];
  return { gameId, updatedGame: game };
};

const startGame = (gameId, requesterId) => {
  const game = getGame(gameId);
  if (!game) {
    throw new Error('Game not found.');
  }
  if (game.hostId !== requesterId) {
    throw new Error('Only the host can start the game.');
  }
  if (game.state !== 'lobby') {
    throw new Error('Game has already started or finished.');
  }
  if (Object.keys(game.players).length === 0) {
    throw new Error('Cannot start a game with no players.');
  }

  game.state = 'playing';
  console.log(`[Game Service] Game ${gameId} has started.`);
  const firstQuestion = game.questions[game.currentQuestionIndex];

  return { updatedGame: game, question: sanitizeQuestion(firstQuestion) };
};

module.exports = {
  createGame,
  getGame,
  addPlayer,
  removePlayer,
  startGame,
};