// catches errors and sends a standardized JSON error response.
const jsonErrorHandler = (err, req, res, next) => {
  // Log the full error to the console
  console.error(err.stack);

  const statusCode = err.statusCode || 500;

  res.status(statusCode).json({
    message: err.message,
    // stack trace for dev !not for prod
    stack: process.env.NODE_ENV === 'production' ? '🥞' : err.stack,
  });
};

module.exports = jsonErrorHandler;