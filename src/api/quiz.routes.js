const express = require('express');
const quizController = require('../controllers/quiz.controller');

const router = express.Router();

router.get('/health',     quizController.getHealth);
router.get('/difficulties', quizController.getDifficulties);

module.exports = router;