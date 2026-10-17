const bcrypt = require('bcryptjs');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const serialize = require('../utils/serializers');
const v = require('../validators');
const { parse } = require('../middleware/validate');

const getProfile = asyncHandler(async (req, res) => {
  res.json({ user: serialize.user(req.user) });
});

const updateProfile = asyncHandler(async (req, res) => {
  const body = parse(v.profile, req.body);
  req.user.name = body.name;
  req.user.phone = body.phone || '';
  await req.user.save();
  res.json({ user: serialize.user(req.user) });
});

const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = parse(v.changePassword, req.body);
  const user = await User.findById(req.user._id).select('+password');
  const ok = await bcrypt.compare(currentPassword, user.password);
  if (!ok) {
    throw new ApiError(400, 'Current password is incorrect', [{ field: 'currentPassword', message: 'Current password is incorrect' }]);
  }
  if (currentPassword === newPassword) {
    throw new ApiError(400, 'New password must be different', [{ field: 'newPassword', message: 'New password must be different' }]);
  }
  user.password = await bcrypt.hash(newPassword, 10);
  await user.save();
  res.json({ message: 'Password changed successfully' });
});

module.exports = { getProfile, updateProfile, changePassword };
