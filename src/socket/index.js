const registerGameHandlers = require('./game.handler');
const { validateDebugPassword } = require('./auth.handler');

module.exports = (io) => {
  const onConnection = (socket) => {
    console.log(`User connected: ${socket.id}`);

    // handlers for different features
    validateDebugPassword(io, socket);
    registerGameHandlers(io, socket);
  };

  io.on('connection', onConnection);
};