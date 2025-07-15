console.log('--- Canary is alive! Deployment successfully updated. ---');
require('dotenv').config();
const http = require('http');
const path = require('path');
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
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        "default-src": ["'self'"],
        // Allow scripts from your domain, inline scripts, and required CDNs
        "script-src": ["'self'", "'unsafe-inline'", "https://cdn.socket.io", "https://cdnjs.cloudflare.com"],
        // Allow styles from your domain, inline styles, and Google Fonts
        "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        // Allow images from your domain and from data URIs
        "img-src": ["'self'", "data:"],
        // Allow API calls, and WebSocket connections to your domain
        "connect-src": ["'self'", "ws:", "wss:"],
        // Allow fonts from Google Fonts
        "font-src": ["'self'", "https://fonts.gstatic.com"],
      },
    },
  })
);
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
// All assets in `src/public` are served directly.
app.use(express.static(path.join(__dirname, 'src', 'public')));

// --- SPA Catch-all Route ---
// This route should be after all other routes and static middleware.
// It serves the main HTML file for any non-API routes.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'src', 'public', 'index.html'));
});

// --- Socket.IO Initialization ---
const io = new Server(server, { cors: corsOptions });
initializeSocket(io);

// --- Start Server ---
server.listen(config.port, () => {
  console.log(`🚀 Server is running on port ${config.port}`);
});