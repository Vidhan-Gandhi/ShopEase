const ApiError = require('../utils/ApiError');

const notFound = (req, res, next) => next(new ApiError(404, 'Route not found'));

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  if (err && err.isApiError) {
    if (err.headers) for (const [k, v] of Object.entries(err.headers)) res.set(k, String(v));
    const body = { message: err.message };
    if (err.errors) body.errors = err.errors;
    Object.assign(body, err.extra || {});
    return res.status(err.status).json(body);
  }
  if (err && (err.type === 'entity.parse.failed' || err instanceof SyntaxError)) {
    return res.status(400).json({ message: 'Invalid JSON body' });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ message: 'Request body is too large' });
  }
  if (err && err.code === 11000) {
    return res.status(409).json({ message: 'A record with these details already exists' });
  }
  if (err && (err.name === 'ValidationError' || err.name === 'CastError')) {
    return res.status(400).json({ message: 'Validation failed', errors: [] });
  }
  if (process.env.NODE_ENV !== 'test') console.error('Unhandled error:', err && err.stack ? err.stack : err);
  return res.status(500).json({ message: 'Something went wrong. Please try again later.' });
};

module.exports = { notFound, errorHandler };
