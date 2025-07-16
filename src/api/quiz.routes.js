const express = require('express');
const quizController = require('../controllers/quiz.controller');

const router = express.Router();

// From your commit: "add health and difficulties endpoints"
router.get('/health',     quizController.getHealth);
router.get('/difficulties', quizController.getDifficulties);

module.exports = router;