const email = require('../utils/emailService');
const resendLimiter = require('../utils/resendLimiter');
const ApiError = require('../utils/ApiError');

// ONC-001: test-only helpers. Every handler answers 404 unless NODE_ENV=test.
const guard = (fn) => (req, res, next) => (process.env.NODE_ENV === 'test' ? fn(req, res) : next(new ApiError(404, 'Route not found')));

const listEmails = guard((req, res) => res.json({ items: email.getOutbox(req.query.to) }));
const clearEmails = guard((req, res) => {
  email.clearOutbox();
  resendLimiter.reset();
  res.json({ message: 'Cleared' });
});

module.exports = { listEmails, clearEmails };
