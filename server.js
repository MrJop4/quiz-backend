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
        // Allow scripts from your domain. Add other domains if you use external scripts.
        "script-src": ["'self'"],
        // Allow styles from your domain and inline styles.
        // The 'unsafe-inline' is needed for style attributes or <style> tags.
        // For higher security, you can remove it and use hashes or nonces.
        "style-src": ["'self'", "'unsafe-inline'"],
        // Allow images from your domain and from data URIs (e.g., base64 encoded images).
        "img-src": ["'self'", "data:"],
        // Allow API calls, and WebSocket connections to your domain.
        "connect-src": ["'self'", "ws:", "wss:"],
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
// All assets in `public` are served directly.
app.use(express.static('public'));

// --- SPA Catch-all Route ---
// This route should be after all other routes and static middleware.
// It serves the main HTML file for any non-API routes.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Socket.IO Initialization ---
const io = new Server(server, { cors: corsOptions });
initializeSocket(io);

// --- Start Server ---
server.listen(config.port, () => {
  console.log(`🚀 Server is running on port ${config.port}`);
});