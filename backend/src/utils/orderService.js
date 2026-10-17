const Order = require('../models/Order');
const Product = require('../models/Product');
const ApiError = require('./ApiError');

const NEXT = {
  Placed: ['Confirmed', 'Cancelled'],
  Confirmed: ['Shipped', 'Cancelled'],
  Shipped: ['Delivered', 'Cancelled'],
  Delivered: [],
  Cancelled: [],
};

/** Give ordered quantities back to stock (products that were deleted are skipped). */
async function restock(items) {
  await Promise.all(
    items.filter((i) => i.product).map((i) => Product.updateOne({ _id: i.product }, { $inc: { stock: i.quantity } }))
  );
}

/**
 * Atomically move an order from `fromStatus` to `toStatus` (only one concurrent caller can win).
 * Returns the updated order or null if the order was no longer in `fromStatus`.
 */
async function transition(filter, fromStatus, toStatus) {
  const updated = await Order.findOneAndUpdate(
    { ...filter, status: fromStatus },
    { $set: { status: toStatus }, $push: { statusHistory: { status: toStatus, at: new Date() } } },
    { new: true }
  );
  if (updated && toStatus === 'Cancelled') await restock(updated.items);
  return updated;
}

function assertTransitionAllowed(from, to) {
  if (!NEXT[from] || !NEXT[from].includes(to)) {
    throw new ApiError(409, `Cannot change status from ${from} to ${to}`);
  }
}

module.exports = { NEXT, restock, transition, assertTransitionAllowed };
