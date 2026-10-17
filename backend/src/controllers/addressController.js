const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const serialize = require('../utils/serializers');
const v = require('../validators');
const { parse } = require('../middleware/validate');

const notFound = () => new ApiError(404, 'Address not found');
const list = (user) => user.addresses.map(serialize.address);

function findAddress(user, id) {
  if (!v.isObjectId(id)) throw notFound();
  const addr = user.addresses.id(id);
  if (!addr) throw notFound();
  return addr;
}

function setOnlyDefault(user, addr) {
  user.addresses.forEach((a) => {
    a.isDefault = String(a._id) === String(addr._id);
  });
}

const listAddresses = asyncHandler(async (req, res) => {
  res.json({ items: list(req.user) });
});

const createAddress = asyncHandler(async (req, res) => {
  const { isDefault, ...fields } = parse(v.address, req.body);
  req.user.addresses.push({ ...fields, isDefault: false });
  const created = req.user.addresses[req.user.addresses.length - 1];
  if (req.user.addresses.length === 1 || isDefault) setOnlyDefault(req.user, created);
  await req.user.save();
  res.status(201).json({ address: serialize.address(created) });
});

const updateAddress = asyncHandler(async (req, res) => {
  const addr = findAddress(req.user, req.params.id);
  const { isDefault, ...fields } = parse(v.address, req.body);
  addr.set(fields);
  if (isDefault) setOnlyDefault(req.user, addr);
  await req.user.save();
  res.json({ address: serialize.address(addr) });
});

const makeDefault = asyncHandler(async (req, res) => {
  const addr = findAddress(req.user, req.params.id);
  setOnlyDefault(req.user, addr);
  await req.user.save();
  res.json({ items: list(req.user) });
});

const deleteAddress = asyncHandler(async (req, res) => {
  const addr = findAddress(req.user, req.params.id);
  const wasDefault = addr.isDefault;
  addr.deleteOne();
  if (wasDefault && req.user.addresses.length > 0) {
    // addresses are appended chronologically, so the last one is the most recently added
    setOnlyDefault(req.user, req.user.addresses[req.user.addresses.length - 1]);
  }
  await req.user.save();
  res.json({ items: list(req.user) });
});

module.exports = { listAddresses, createAddress, updateAddress, makeDefault, deleteAddress };
