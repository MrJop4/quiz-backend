const process = require('process');

module.exports = (io, socket) => {
  const registerModerator = ({ password }) => {
    const expectedPassword = process.env.MODERATOR_PASSWORD;
    console.log(`[Socket] Attempting moderator registration from ${socket.id}`);
    
    if (!expectedPassword) {
      console.error("[Socket] MODERATOR_PASSWORD is not set in the environment variables.");
      return socket.emit('moderatorAuthFailed', { message: "Server configuration error: Moderator password not set." });
    }
    
    if (password === expectedPassword) {
      console.log(`[Socket] Moderator registered successfully: ${socket.id}`);
      socket.isModerator = true;

      // Join a moderator-specific room.
      // NOTE: You can emit all room data to this room.
      socket.join('moderators');
      
      // Send success event.
      socket.emit('moderatorAuthSuccess');

      // Fetch initial game data and send it to the moderator.
      // Assuming gameService.getAllGames() exists and returns an array of game data.
      // Adapt this part based on how you store/manage game data on the server.
      // Example: const games = gameService.getAllGames();
      //          socket.emit('allGameData', games);
      
      // For now, just log a message and send an empty array.
      console.log("[Socket] Sending initial game data to the new moderator.");
      io.to('moderators').emit('serverStatusUpdate', getServerStatus(io)); // Send global status to all moderators.


    } else {
      console.log(`[Socket] Moderator registration failed for ${socket.id}: Incorrect password`);
      socket.emit('moderatorAuthFailed', { message: "Mot de passe incorrect." });
    }
  };

  // Global status update - to be adapted to your needs
  function getServerStatus(io) {
    const gameRooms = gameService.getAllGames(); // Assuming this returns an array of room objects
    const numPlayers = Array.from(io.sockets.sockets.values()).filter(socket => socket.playerId).length;

    return {
      rooms: gameRooms.length,
      players: numPlayers,
      uptime: process.uptime(),
      roomDetails: gameRooms // Now, this contains the actual room details
    };
  }


  // Register the event handler.
  socket.on('registerModerator', registerModerator);
};