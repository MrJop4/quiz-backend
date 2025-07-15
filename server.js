const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');

const config = require('./src/config');
const apiRouter = require('./src/api');
const jsonErrorHandler = require('./src/middleware/errorHandler');
const initializeSocket = require('./src/socket');

// --- App & Server Initialization ---
const app = express();
const server = http.createServer(app);

// --- CORS Configuration ---
// Your commit history shows you've worked on this. It's good practice.
const corsOptions = {
  origin: config.allowedOrigins,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// --- Middleware ---
app.use(express.json()); // for parsing application/json

// --- API Routes ---
// Health check and difficulties endpoints before static middleware, as you did.
app.use('/api', apiRouter);

// --- Static Files ---
// This addresses your concern about serving files to clients.
// All assets in `public` are served directly.
app.use(express.static('public'));

// --- Socket.IO Initialization ---
const io = new Server(server, { cors: corsOptions });
initializeSocket(io);

// --- Error Handling Middleware ---
// This must be the LAST middleware. It catches any errors that occur in the route handlers.
app.use(jsonErrorHandler);

// --- Start Server ---
server.listen(config.port, () => {
  console.log(`🚀 Server is running on port ${config.port}`);
});