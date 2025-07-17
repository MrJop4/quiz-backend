const express = require('express');
const quizRoutes = require('./quiz.routes');

const router = express.Router();

// routers
router.use(quizRoutes);

module.exports = router;