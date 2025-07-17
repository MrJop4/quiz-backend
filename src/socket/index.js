const registerGameHandlers = require('./game.handler');

module.exports = (io) => {
  const onConnection = (socket) => {
    console.log(`User connected: ${socket.id}`);

    // handlers for different features
    registerGameHandlers(io, socket);
  };

  io.on('connection', onConnection);
};