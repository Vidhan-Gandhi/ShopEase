const mongoose = require('mongoose');
const Product = require('../models/Product');
const Cart = require('../models/Cart');
const { toPaise, fromPaise, effectivePrice, deliveryForPaise } = require('./money');

const isId = (s) => typeof s === 'string' && /^[0-9a-fA-F]{24}$/.test(s);

/**
 * Resolve raw lines [{productId, quantity, name?}] against current products.
 * Returns { lines: [{product, quantity}], unavailable: [], notices: [] }.
 * Out-of-stock and deleted products are dropped; quantities above stock are lowered.
 * Duplicate product ids are summed first.
 */
async function resolveLines(rawLines) {
  const merged = new Map();
  for (const l of rawLines) {
    const key = String(l.productId);
    const prev = merged.get(key);
    if (prev) prev.quantity += l.quantity;
    else merged.set(key, { productId: key, quantity: l.quantity, name: l.name || '' });
  }
  const validIds = [...merged.keys()].filter(isId).map((id) => new mongoose.Types.ObjectId(id));
  const products = validIds.length ? await Product.find({ _id: { $in: validIds } }).lean() : [];
  const byId = new Map(products.map((p) => [String(p._id), p]));

  const lines = [];
  const unavailable = [];
  const notices = [];
  for (const entry of merged.values()) {
    const p = byId.get(entry.productId);
    if (!p) {
      const name = entry.name || 'An item';
      unavailable.push({ productId: entry.productId, name, reason: 'deleted' });
      notices.push(`${name} is no longer available`);
      continue;
    }
    if (p.stock <= 0) {
      unavailable.push({ productId: entry.productId, name: p.name, reason: 'out_of_stock' });
      notices.push(`${p.name} is out of stock and was removed from your cart`);
      continue;
    }
    let quantity = entry.quantity;
    if (quantity > p.stock) {
      quantity = p.stock;
      notices.push(`Quantity for ${p.name} reduced to ${p.stock} (stock limit)`);
    }
    lines.push({ product: p, quantity });
  }
  return { lines, unavailable, notices };
}

function totalsFor(lines) {
  const subtotalPaise = lines.reduce((s, l) => s + toPaise(effectivePrice(l.product)) * l.quantity, 0);
  const deliveryPaise = deliveryForPaise(subtotalPaise, lines.length > 0);
  return {
    subtotal: fromPaise(subtotalPaise),
    deliveryCharge: fromPaise(deliveryPaise),
    grandTotal: fromPaise(subtotalPaise + deliveryPaise),
  };
}

function buildView({ lines, unavailable, notices }) {
  const totals = totalsFor(lines);
  return {
    items: lines.map((l) => {
      const unitPrice = effectivePrice(l.product);
      return {
        productId: String(l.product._id),
        name: l.product.name,
        image: l.product.images[0] || '',
        price: l.product.price,
        discountedPrice: l.product.discountedPrice === undefined ? null : l.product.discountedPrice,
        unitPrice,
        quantity: l.quantity,
        stock: l.product.stock,
        lineTotal: fromPaise(toPaise(unitPrice) * l.quantity),
      };
    }),
    itemCount: lines.reduce((s, l) => s + l.quantity, 0),
    ...totals,
    unavailable,
    notices,
  };
}

async function getOrCreateCart(userId) {
  let cart = await Cart.findOne({ user: userId });
  if (!cart) cart = new Cart({ user: userId, items: [] });
  return cart;
}

const cartToRaw = (cart) => cart.items.map((i) => ({ productId: String(i.product), quantity: i.quantity, name: i.name }));

/** Persist resolved lines into the stored cart. */
async function saveLines(cart, lines) {
  cart.items = lines.map((l) => ({ product: l.product._id, name: l.product.name, quantity: l.quantity }));
  await cart.save();
}

/** Resolve the stored cart, persist the corrected lines and return the resolution. */
async function loadAndSyncCart(userId) {
  const cart = await getOrCreateCart(userId);
  const resolved = await resolveLines(cartToRaw(cart));
  const changed =
    resolved.unavailable.length > 0 ||
    resolved.lines.length !== cart.items.length ||
    resolved.lines.some((l, i) => cart.items[i] && cart.items[i].quantity !== l.quantity);
  if (changed || cart.isNew) await saveLines(cart, resolved.lines);
  return { cart, ...resolved };
}

module.exports = { resolveLines, buildView, totalsFor, getOrCreateCart, cartToRaw, saveLines, loadAndSyncCart, isId };
