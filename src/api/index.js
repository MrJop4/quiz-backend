const express = require('express');
const quizRoutes = require('./quiz.routes');

const router = express.Router();

// Mount more routers here, e.g., router.use('/users', userRoutes);
router.use(quizRoutes);

module.exports = router;