const Order = require('../models/Order');
const Product = require('../models/Product');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const cartService = require('../utils/cartService');
const orderService = require('../utils/orderService');
const serialize = require('../utils/serializers');
const { generateOrderNumber } = require('../utils/orderNumber');
const { toPaise, fromPaise, effectivePrice, formatRupees, deliveryForPaise } = require('../utils/money');
const v = require('../validators');
const { parse } = require('../middleware/validate');

const PAGE_SIZE = 10;
const METHODS = {
  COD: { paymentMethod: 'Cash on Delivery', paymentStatus: 'Pending (pay on delivery)' },
  ONLINE: { paymentMethod: 'Online payment', paymentStatus: 'Paid (simulated)' },
};

const orderNotFound = () => new ApiError(404, 'Order not found');

function conflict(changes, view) {
  return new ApiError(409, changes.map((c) => c.message).join('; '), [], { changes, cart: view });
}

/**
 * Validates body, address, cart and the live stock/prices. Throws 400/404 for bad input and
 * 409 (with `changes` and the corrected `cart`) when anything changed since the review.
 */
async function prepare(req) {
  let body;
  try {
    body = parse(v.orderBody, req.body);
  } catch (e) {
    // FR-019 AC6: an invalid payment method is reported with its own message
    if (e.isApiError && e.errors && e.errors.some((x) => x.field === 'paymentMethod')) e.message = 'Invalid payment method';
    throw e;
  }
  const addr = v.isObjectId(body.addressId) ? req.user.addresses.id(body.addressId) : null;
  if (!addr) throw new ApiError(404, 'Address not found');

  const cart = await cartService.getOrCreateCart(req.user._id);
  if (cart.items.length === 0) throw new ApiError(400, 'Your cart is empty');

  const raw = cartService.cartToRaw(cart);
  const resolved = await cartService.resolveLines(raw);
  const wantedQty = new Map();
  raw.forEach((r) => wantedQty.set(r.productId, (wantedQty.get(r.productId) || 0) + r.quantity));

  const changes = [];
  for (const u of resolved.unavailable) {
    changes.push({
      type: 'removed',
      productId: u.productId,
      name: u.name,
      message: u.reason === 'deleted' ? `${u.name} is no longer available` : `${u.name} is out of stock`,
    });
  }
  const reviewed = new Map((body.reviewedItems || []).map((r) => [r.productId, r]));
  for (const line of resolved.lines) {
    const id = String(line.product._id);
    const name = line.product.name;
    if (line.quantity < wantedQty.get(id)) {
      changes.push({
        type: 'quantity',
        productId: id,
        name,
        message: `Only ${line.product.stock} of ${name} available`,
        newQuantity: line.quantity,
      });
    }
    const rev = reviewed.get(id);
    const unit = effectivePrice(line.product);
    if (rev && toPaise(rev.unitPrice) !== toPaise(unit)) {
      changes.push({
        type: 'price',
        productId: id,
        name,
        message: `Price of ${name} changed from ${formatRupees(rev.unitPrice)} to ${formatRupees(unit)}`,
        oldUnitPrice: rev.unitPrice,
        newUnitPrice: unit,
      });
    }
  }

  const totals = cartService.totalsFor(resolved.lines);
  if (body.reviewedItems) {
    const oldSub = body.reviewedItems.reduce((s, r) => s + toPaise(r.unitPrice) * r.quantity, 0);
    const oldDelivery = fromPaise(deliveryForPaise(oldSub, body.reviewedItems.length > 0));
    if (oldDelivery !== totals.deliveryCharge && changes.length > 0) {
      changes.push({
        type: 'delivery',
        message: `Delivery charge changed from ${formatRupees(oldDelivery)} to ${formatRupees(totals.deliveryCharge)}`,
        oldDeliveryCharge: oldDelivery,
        newDeliveryCharge: totals.deliveryCharge,
      });
    }
  }

  if (changes.length > 0) {
    await cartService.saveLines(cart, resolved.lines);
    throw conflict(changes, cartService.buildView({ lines: resolved.lines, unavailable: resolved.unavailable, notices: [] }));
  }
  return { body, addr, cart, resolved, totals };
}

const checkOrder = asyncHandler(async (req, res) => {
  const { resolved } = await prepare(req);
  res.json({ ok: true, cart: cartService.buildView(resolved) });
});

async function decrementStock(lines) {
  const done = [];
  for (const line of lines) {
    const r = await Product.updateOne({ _id: line.product._id, stock: { $gte: line.quantity } }, { $inc: { stock: -line.quantity } });
    if (r.modifiedCount !== 1) {
      await Promise.all(done.map((d) => Product.updateOne({ _id: d.product._id }, { $inc: { stock: d.quantity } })));
      return false;
    }
    done.push(line);
  }
  return true;
}

async function createWithUniqueNumber(doc) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      return await Order.create({ ...doc, orderNumber: generateOrderNumber() });
    } catch (e) {
      const dupNumber = e && e.code === 11000 && ((e.keyPattern && e.keyPattern.orderNumber) || /orderNumber/.test(e.message || ''));
      if (!dupNumber) throw e;
    }
  }
  throw new Error('Could not allocate a unique order number');
}

const placeOrder = asyncHandler(async (req, res) => {
  const { body, addr, cart, resolved, totals } = await prepare(req);

  const ok = await decrementStock(resolved.lines);
  if (!ok) {
    // Stock changed between the check and the decrement: report the new reality.
    await prepare(req); // throws 409 with the specific changes if it can detect them
    throw new ApiError(409, 'Stock changed while placing your order. Please review your cart and try again.', [], {
      changes: [],
      cart: cartService.buildView(await cartService.resolveLines(cartService.cartToRaw(cart))),
    });
  }

  const method = METHODS[body.paymentMethod];
  let order;
  try {
    const now = new Date();
    order = await createWithUniqueNumber({
      user: req.user._id,
      items: resolved.lines.map((l) => {
        const unitPrice = effectivePrice(l.product);
        return {
          product: l.product._id,
          name: l.product.name,
          image: l.product.images[0] || '',
          unitPrice,
          quantity: l.quantity,
          lineTotal: fromPaise(toPaise(unitPrice) * l.quantity),
        };
      }),
      address: {
        name: addr.name,
        phone: addr.phone,
        addressLine: addr.addressLine,
        city: addr.city,
        state: addr.state,
        pincode: addr.pincode,
      },
      paymentMethod: method.paymentMethod,
      paymentStatus: method.paymentStatus,
      subtotal: totals.subtotal,
      deliveryCharge: totals.deliveryCharge,
      grandTotal: totals.grandTotal,
      status: 'Placed',
      statusHistory: [{ status: 'Placed', at: now }],
    });
  } catch (e) {
    await orderService.restock(resolved.lines.map((l) => ({ product: l.product._id, quantity: l.quantity })));
    throw e;
  }

  cart.items = [];
  await cart.save();
  res.status(201).json({ order: serialize.order(order) });
});

const listOrders = asyncHandler(async (req, res) => {
  const { page: p } = parse(v.pageQuery, req.query);
  const page = p ? Number(p) : 1;
  const filter = { user: req.user._id };
  const [items, total] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .lean(),
    Order.countDocuments(filter),
  ]);
  res.json({ items: items.map(serialize.orderSummary), page, limit: PAGE_SIZE, total, totalPages: Math.ceil(total / PAGE_SIZE) });
});

const getOrder = asyncHandler(async (req, res) => {
  if (!v.isObjectId(req.params.id)) throw orderNotFound();
  const order = await Order.findOne({ _id: req.params.id, user: req.user._id }).lean();
  if (!order) throw orderNotFound();
  res.json({ order: serialize.order(order) });
});

const cancelOrder = asyncHandler(async (req, res) => {
  if (!v.isObjectId(req.params.id)) throw orderNotFound();
  const filter = { _id: req.params.id, user: req.user._id };
  const exists = await Order.exists(filter);
  if (!exists) throw orderNotFound();
  const updated = await orderService.transition(filter, 'Placed', 'Cancelled');
  if (!updated) throw new ApiError(409, 'Only orders in Placed status can be cancelled');
  res.json({ order: serialize.order(updated) });
});

module.exports = { checkOrder, placeOrder, listOrders, getOrder, cancelOrder, PAGE_SIZE };
