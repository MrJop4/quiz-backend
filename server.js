const http = require('http');
const express = require('express');
const path = require('path');
const cors = require('cors');
const { Server } = require('socket.io');
const dotenv = require('dotenv');
dotenv.config();

const config = require('./src/config');
const apiRouter = require('./src/api');
const jsonErrorHandler = require('./src/middleware/errorHandler');
const initializeSocket = require('./src/socket');

// --- App + Server Init ---
if (!process.env.MODERATOR_PASSWORD || !process.env.DEBUG_PASSWORD) {
    console.error('ERROR! Missing MODERATOR_PASSWORD or DEBUG_PASSWORD environment variables. Ensure .env file is configured.');
    process.exit(1);
}
const moderatorPassword = process.env.MODERATOR_PASSWORD;
const debugPassword = process.env.DEBUG_PASSWORD;
const app = express();
const server = http.createServer(app);

// --- CORS Conf ---
const corsOptions = {
  origin: config.allowedOrigins,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// --- Middleware ---
app.use(express.json()); // for parsing application/json

// --- API Routes ---
app.use('/api', apiRouter);

// --- Static ressources ---
// main public directory (for index.html, etc.)
app.use(express.static(path.join(__dirname, 'src', 'public')));
// project root. This makes ( for qr-code.png, 'images' and 'avatar')
app.use(express.static(__dirname));


// --- SPA Catch-all Route ---
// sends the index.html for any request that doesn't match API / static file.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'src', 'public', 'index.html'));
});

// --- Socket.IO Init ---
const io = new Server(server, { cors: corsOptions });
initializeSocket(io);

// --- Error Handling Middleware ---
// catches any errors that occur in the route handlers.
app.use(jsonErrorHandler);

// --- Start Server ---
server.listen(config.port,() => {
  console.log(`🚀 Server is running on port ${config.port}`);
});