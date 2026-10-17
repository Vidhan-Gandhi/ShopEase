const Product = require('../models/Product');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const cartService = require('../utils/cartService');
const v = require('../validators');
const { parse } = require('../middleware/validate');

const onlyAvailable = (n) =>
  new ApiError(400, `Only ${n} available`, [{ field: 'quantity', message: `Only ${n} available` }]);

async function respondWithCart(res, userId) {
  const synced = await cartService.loadAndSyncCart(userId);
  res.json(cartService.buildView(synced));
}

const validateGuestCart = asyncHandler(async (req, res) => {
  const { items } = parse(v.cartLines, req.body);
  const resolved = await cartService.resolveLines(items);
  res.json(cartService.buildView(resolved));
});

const getCart = asyncHandler(async (req, res) => {
  await respondWithCart(res, req.user._id);
});

const addItem = asyncHandler(async (req, res) => {
  const { productId, quantity } = parse(v.addItem, req.body);
  if (!v.isObjectId(productId)) throw new ApiError(404, 'Product not found');
  const product = await Product.findById(productId).lean();
  if (!product) throw new ApiError(404, 'Product not found');
  if (product.stock <= 0) throw new ApiError(409, 'This product is out of stock');

  await cartService.loadAndSyncCart(req.user._id); // drop stale lines first
  const cart = await cartService.getOrCreateCart(req.user._id);
  const line = cart.items.find((i) => String(i.product) === String(product._id));
  const newQty = (line ? line.quantity : 0) + quantity;
  if (newQty > product.stock) throw onlyAvailable(product.stock);
  if (line) line.quantity = newQty;
  else cart.items.push({ product: product._id, name: product.name, quantity: newQty });
  await cart.save();
  await respondWithCart(res, req.user._id);
});

const updateItem = asyncHandler(async (req, res) => {
  const { quantity } = parse(v.setQuantity, req.body);
  const { productId } = req.params;
  const cart = await cartService.getOrCreateCart(req.user._id);
  const line = v.isObjectId(productId) ? cart.items.find((i) => String(i.product) === productId) : null;
  if (!line) throw new ApiError(404, 'Item not found in cart');
  const product = await Product.findById(productId).lean();
  if (!product || product.stock <= 0) {
    cart.items = cart.items.filter((i) => String(i.product) !== productId);
    await cart.save();
    if (!product) throw new ApiError(404, 'Item not found in cart');
    throw new ApiError(409, 'This product is out of stock');
  }
  if (quantity > product.stock) throw onlyAvailable(product.stock);
  line.quantity = quantity;
  await cart.save();
  await respondWithCart(res, req.user._id);
});

const removeItem = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const cart = await cartService.getOrCreateCart(req.user._id);
  cart.items = cart.items.filter((i) => String(i.product) !== productId);
  await cart.save();
  await respondWithCart(res, req.user._id);
});

const mergeCart = asyncHandler(async (req, res) => {
  const { items } = parse(v.cartLines, req.body);
  const cart = await cartService.getOrCreateCart(req.user._id);
  const raw = [...cartService.cartToRaw(cart), ...items];
  const resolved = await cartService.resolveLines(raw);
  await cartService.saveLines(cart, resolved.lines);
  res.json(cartService.buildView(resolved));
});

module.exports = { validateGuestCart, getCart, addItem, updateItem, removeItem, mergeCart };
