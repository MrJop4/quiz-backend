const {getIO} = require('./socketManager');

exports.validateDebugPassword = (io, socket) => {
  const validateDebug = ({ password }) => {
    if (password === process.env.DEBUG_PASSWORD) {
      console.log(`[Socket] Mode débogage activé par ${socket.id}`);
      socket.emit('debugToggled', { enabled: true, message: 'Mode débogage activé.' });
    } else {
      console.log(`[Socket] Tentative d'activation du mode débogage refusée pour ${socket.id}`);
      socket.emit('debugToggled', { enabled: false, message: 'Mot de passe de débogage incorrect.' });
    }
  };

  socket.on('validateDebug', validateDebug);
};