const quizService = require('../services/quiz.service');

exports.getHealth = (req, res) => {
  res.status(200).json({ status: 'ok' });
};

exports.getDifficulties = (req, res) => {
  const difficulties = quizService.getAvailableDifficulties();
  res.status(200).json(difficulties);
};