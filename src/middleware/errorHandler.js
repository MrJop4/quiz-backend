/**
 * A middleware function that catches errors and sends a standardized JSON error response.
 * This should be the last middleware added to the Express app.
 */
const jsonErrorHandler = (err, req, res, next) => {
  // Log the full error to the console for debugging on the server.
  console.error(err.stack);

  // Use the error's status code or default to 500 (Internal Server Error).
  const statusCode = err.statusCode || 500;

  res.status(statusCode).json({
    message: err.message,
    // In development, you might want to send the stack trace. In production, it's better to hide it.
    stack: process.env.NODE_ENV === 'production' ? '🥞' : err.stack,
  });
};

module.exports = jsonErrorHandler;