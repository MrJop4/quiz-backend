const registerGameHandlers = require('./game.handler');
const { validateDebugPassword } = require('./auth.handler');
const registerModeratorHandlers = require('./moderator.handler'); // Import the new handler

module.exports = (io) => {
  const onConnection = (socket) => {
    console.log(`User connected: ${socket.id}`);

    // handlers for different features
    validateDebugPassword(io, socket); // Register debug handler
    registerGameHandlers(io, socket);   // Register game-related handlers
    registerModeratorHandlers(io, socket); // Register moderator handlers
  };

  io.on('connection', onConnection);
};