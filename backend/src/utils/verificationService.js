const crypto = require('crypto');
const EmailVerificationToken = require('../models/EmailVerificationToken');
const { sendVerificationEmail } = require('./emailService');

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const hashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

/** Replaces any earlier tokens of the user with a fresh one and emails the link. Mail failure does not throw. */
async function issueAndSend(user) {
  const token = crypto.randomBytes(32).toString('hex');
  await EmailVerificationToken.deleteMany({ user: user._id });
  await EmailVerificationToken.create({ user: user._id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + TOKEN_TTL_MS) });
  try {
    await sendVerificationEmail(user, token);
    return true;
  } catch (e) {
    if (process.env.NODE_ENV !== 'test') console.error('Failed to send verification email:', e && e.message);
    return false;
  }
}

/** Atomically consumes a valid unused token. Returns the user id or null. */
async function consume(token) {
  if (typeof token !== 'string' || !/^[0-9a-f]{64}$/i.test(token)) return null;
  const doc = await EmailVerificationToken.findOneAndUpdate(
    { tokenHash: hashToken(token.toLowerCase()), usedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { usedAt: new Date() } }
  );
  return doc ? doc.user : null;
}

module.exports = { issueAndSend, consume, hashToken, TOKEN_TTL_MS };
