const questionDatabase = require('../../questiondatabase');

/**
 * Shuffles array in place.
 * @param {Array} a items An array containing the items.
 */
const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

exports.getAvailableDifficulties = () => {
  // Use a map to aggregate difficulties and count questions.
  const difficultyMap = questionDatabase.reduce((acc, question) => {
    const { difficulty } = question;

    // Skip any questions that might not have a difficulty set.
    if (!difficulty) {
      return acc;
    }

    // If we haven't seen this difficulty before, initialize it.
    if (!acc[difficulty]) {
      acc[difficulty] = {
        id: difficulty,
        // Capitalize the first letter for a nice display name.
        name: difficulty.charAt(0).toUpperCase() + difficulty.slice(1),
        questions: 0,
      };
    }

    // Increment the question count for this difficulty.
    acc[difficulty].questions += 1;
    return acc;
  }, {});

  // Convert the map of difficulties into an array for the API response.
  return Object.values(difficultyMap);
};

exports.getQuestionsForDifficulty = (difficulty, maxQuestions = 10) => {
  const allQuestionsForDifficulty = questionDatabase.filter(
    (q) => q.difficulty === difficulty
  );

  // If we want more questions than are available, return all of them
  if (maxQuestions >= allQuestionsForDifficulty.length) {
    return shuffle(allQuestionsForDifficulty);
  }

  return shuffle(allQuestionsForDifficulty).slice(0, maxQuestions);
};