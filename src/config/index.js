require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  allowedOrigins: [
    'http://localhost:5173',
    'https://polyquiz-sc.up.railway.app'
  ],
};