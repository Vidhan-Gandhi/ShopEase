const toPaise = (n) => Math.round(Number(n) * 100);
const fromPaise = (p) => Math.round(p) / 100;
const effectivePrice = (p) => (p.discountedPrice !== null && p.discountedPrice !== undefined ? p.discountedPrice : p.price);
const formatRupees = (n) => `₹${Number(n).toFixed(2)}`;
const FREE_DELIVERY_THRESHOLD_PAISE = 49900;
const DELIVERY_CHARGE_PAISE = 4900;
const deliveryForPaise = (subtotalPaise, hasItems = true) =>
  !hasItems ? 0 : subtotalPaise >= FREE_DELIVERY_THRESHOLD_PAISE ? 0 : DELIVERY_CHARGE_PAISE;
module.exports = { toPaise, fromPaise, effectivePrice, formatRupees, deliveryForPaise };
