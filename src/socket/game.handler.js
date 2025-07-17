const gameService = require('../services/game.service');

module.exports = (io, socket) => {
  const createGame = ({ difficulty }) => {
    try {
      const newGame = gameService.createGame(socket.id, difficulty);
      socket.join(newGame.id);
      // Only send to the host who created it !
      socket.emit('game:created', newGame);
    } catch (error) {
      socket.emit('game:error', { message: error.message });
    }
  };

  const joinGame = ({ gameId, playerData }) => {
    try {
      // --- Input Validation Example ---
      if (!gameId || typeof gameId !== 'string' || gameId.length !== 5) {
        return socket.emit('game:error', { message: 'Invalid Game ID format.' });
      }
      if (!playerData || typeof playerData.name !== 'string' || playerData.name.trim().length === 0 || playerData.name.length > 15) {
        return socket.emit('game:error', { message: 'Invalid player name. Must be 1-15 characters.' });
      }
      // possibility to add more checks for avatar, ship, etc. here

      // Add player to the game state
      const updatedGame = gameService.addPlayer(gameId, socket.id, playerData);
      socket.join(gameId);
      // Store gameId on the socket for good disconnect handling
      socket.gameId = gameId;

      // Notify everyone in the room (including the new player) about the update
      io.to(gameId).emit('game:playerJoined', updatedGame);
    } catch (error) {
      socket.emit('game:error', { message: error.message });
    }
  };

  const onDisconnect = () => {
    // Use the stored gameId for a direct lookup, no more searching!
    const gameId = socket.gameId;
    if (gameId) {
      const result = gameService.removePlayer(gameId, socket.id);
      // Notify remaining players that someone left
      io.to(result.gameId).emit('game:playerLeft', result.updatedGame);
    }
  };

  const startGame = ({ gameId }) => {
    try {
      const { updatedGame, question } = gameService.startGame(gameId, socket.id);

      // Notify clients the game has officially started
      io.to(gameId).emit('game:started', {
        players: updatedGame.players,
        difficulty: updatedGame.difficulty,
      });

      // Send the first question
      io.to(gameId).emit('game:newQuestion', {
        question: question,
        questionIndex: updatedGame.currentQuestionIndex,
        totalQuestions: updatedGame.questions.length,
      });
    } catch (error) {
      // Send the error message only to the host who tried to start the game
      socket.emit('game:error', { message: error.message });
    }
  };

  // Registering event listeners on the socket
  socket.on('game:create', createGame);
  socket.on('game:join', joinGame);
  socket.on('game:start', startGame);
  socket.on('disconnect', onDisconnect);
};