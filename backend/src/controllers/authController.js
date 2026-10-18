const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const limiter = require('../utils/loginRateLimiter');
const serialize = require('../utils/serializers');
const v = require('../validators');
const { parse } = require('../middleware/validate');
const { isDisposable } = require('../utils/disposableDomains');
const verification = require('../utils/verificationService');
const resendLimiter = require('../utils/resendLimiter');
const { jwtSecret, JWT_EXPIRES_IN } = require('../config');

const BCRYPT_COST = 10;
// Used to keep response time similar when the email is unknown.
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', BCRYPT_COST);

function signToken(user) {
  return jwt.sign({ id: String(user._id), role: user.role }, jwtSecret(), { algorithm: 'HS256', expiresIn: JWT_EXPIRES_IN });
}

const signup = asyncHandler(async (req, res) => {
  const { name, email, password } = parse(v.signup, req.body);
  if (isDisposable(email)) {
    const msg = 'Disposable email addresses are not allowed. Please use a permanent email';
    throw new ApiError(400, 'Validation failed', [{ field: 'email', message: msg }]);
  }
  const existing = await User.findOne({ email }).select('_id');
  const dupError = new ApiError(409, 'An account with this email already exists', [
    { field: 'email', message: 'An account with this email already exists' },
  ]);
  if (existing) throw dupError;
  const hash = await bcrypt.hash(password, BCRYPT_COST);
  let user;
  try {
    user = await User.create({ name, email, password: hash, role: 'customer', emailVerified: false });
  } catch (e) {
    if (e && e.code === 11000) throw dupError;
    throw e;
  }
  await verification.issueAndSend(user);
  res.status(201).json({
    message: 'Account created. Please check your email and click the verification link before logging in.',
    user: serialize.user(user),
  });
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = parse(v.login, req.body);
  const ip = req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';

  const retryAfter = limiter.getRetryAfter(ip, email);
  if (retryAfter > 0) {
    throw new ApiError(429, 'Too many failed login attempts. Please try again later.', undefined, {}, { 'Retry-After': retryAfter });
  }

  const user = await User.findOne({ email }).select('+password');
  const ok = await bcrypt.compare(password, user ? user.password : DUMMY_HASH);
  if (!user || !ok) {
    limiter.recordFailure(ip, email);
    throw new ApiError(401, 'Invalid email or password');
  }
  if (user.role === 'customer' && user.emailVerified === false) {
    throw new ApiError(403, 'Please verify your email first', undefined, { code: 'EMAIL_NOT_VERIFIED', email: user.email });
  }
  limiter.resetEmail(email);
  res.json({ token: signToken(user), user: serialize.user(user) });
});

const verifyEmail = asyncHandler(async (req, res) => {
  const { token } = parse(v.verifyEmail, req.body);
  const userId = await verification.consume(token);
  if (!userId) throw new ApiError(400, 'This verification link is invalid or has expired');
  await User.updateOne({ _id: userId }, { $set: { emailVerified: true, emailVerifiedAt: new Date() } });
  res.json({ message: 'Email verified. You can now log in.' });
});

const resendVerification = asyncHandler(async (req, res) => {
  const { email } = parse(v.resendVerification, req.body);
  const wait = resendLimiter.consume(email);
  if (wait > 0) {
    throw new ApiError(429, 'Too many verification emails requested. Please try again later.', undefined, {}, { 'Retry-After': wait });
  }
  const user = await User.findOne({ email });
  if (user && user.role === 'customer' && user.emailVerified === false) await verification.issueAndSend(user);
  // Same answer whether or not the account exists / is already verified (no account enumeration).
  res.json({ message: 'If this email belongs to an unverified account, a new verification email has been sent.' });
});

module.exports = { signup, login, verifyEmail, resendVerification };
