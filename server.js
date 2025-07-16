const http = require('http');
const express = require('express');
const path = require('path');
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
app.use('/api', apiRouter);

// --- Static Files ---
// This addresses your concern about serving files to clients.
// First, serve files from the main public directory (for index.html, etc.)
app.use(express.static(path.join(__dirname, 'src', 'public')));

// Then, serve files from the project root. This makes qr-code.png,
// and the 'images' and 'avatar' folders accessible if they are at the root.
app.use(express.static(__dirname));


// --- SPA Catch-all Route ---
// This must be the LAST GET route before error handlers. It sends the index.html
// for any request that doesn't match the API or a static file.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'src', 'public', 'index.html'));
});

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