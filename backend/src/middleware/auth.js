const jwt = require('jsonwebtoken');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { jwtSecret } = require('../config');

const EXPIRED = 'Your session has expired. Please log in again';

const authenticate = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) throw new ApiError(401, 'Please log in to continue');
  const token = header.slice(7).trim();
  let payload;
  try {
    payload = jwt.verify(token, jwtSecret(), { algorithms: ['HS256'] });
  } catch (e) {
    throw new ApiError(401, EXPIRED);
  }
  const user = await User.findById(payload.id);
  if (!user) throw new ApiError(401, EXPIRED);
  req.user = user;
  next();
});

const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') return next(new ApiError(403, 'Not authorised'));
  return next();
};

const requireCustomer = (req, res, next) => {
  if (!req.user || req.user.role !== 'customer') return next(new ApiError(403, 'Admin accounts cannot place orders'));
  return next();
};

module.exports = { authenticate, requireAdmin, requireCustomer };
