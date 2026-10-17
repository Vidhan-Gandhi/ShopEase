const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const limiter = require('../utils/loginRateLimiter');
const serialize = require('../utils/serializers');
const v = require('../validators');
const { parse } = require('../middleware/validate');
const { jwtSecret, JWT_EXPIRES_IN } = require('../config');

const BCRYPT_COST = 10;
// Used to keep response time similar when the email is unknown.
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', BCRYPT_COST);

function signToken(user) {
  return jwt.sign({ id: String(user._id), role: user.role }, jwtSecret(), { algorithm: 'HS256', expiresIn: JWT_EXPIRES_IN });
}

const signup = asyncHandler(async (req, res) => {
  const { name, email, password } = parse(v.signup, req.body);
  const existing = await User.findOne({ email }).select('_id');
  const dupError = new ApiError(409, 'An account with this email already exists', [
    { field: 'email', message: 'An account with this email already exists' },
  ]);
  if (existing) throw dupError;
  const hash = await bcrypt.hash(password, BCRYPT_COST);
  let user;
  try {
    user = await User.create({ name, email, password: hash, role: 'customer' });
  } catch (e) {
    if (e && e.code === 11000) throw dupError;
    throw e;
  }
  res.status(201).json({ token: signToken(user), user: serialize.user(user) });
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
  limiter.resetEmail(email);
  res.json({ token: signToken(user), user: serialize.user(user) });
});

module.exports = { signup, login };
