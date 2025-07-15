const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const helmet = require('helmet');
const config = require('./src/config');
const apiRouter = require('./src/api');
const initializeSocket = require('./src/socket');

// --- App & Server Initialization ---
const app = express();
const server = http.createServer(app);
app.use(helmet());

// --- CORS Configuration ---
const corsOptions = {
  origin: config.allowedOrigins,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// --- Middleware ---
app.use(express.json()); // for parsing application/json

// --- API Routes ---
app.use('/api', apiRouter);

// --- Static Files ---
// Health check and difficulties endpoints are now before static middleware
// This addresses your concern about serving files to clients.
// All assets in `public` are served directly.
app.use(express.static('public'));

// --- Socket.IO Initialization ---
const io = new Server(server, { cors: corsOptions });
initializeSocket(io);

// --- Start Server ---
server.listen(config.port, () => {
  console.log(`🚀 Server is running on port ${config.port}`);
});