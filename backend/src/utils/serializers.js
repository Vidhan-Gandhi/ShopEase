const { effectivePrice } = require('./money');

const idOf = (v) => (v && v._id ? String(v._id) : String(v));

function stockStatus(stock) {
  if (stock <= 0) return 'Out of stock';
  if (stock <= 5) return `Only ${stock} left`;
  return 'In stock';
}

function user(u) {
  return {
    id: String(u._id),
    name: u.name,
    email: u.email,
    phone: u.phone || '',
    role: u.role,
    createdAt: u.createdAt,
  };
}

function address(a) {
  return {
    id: String(a._id),
    name: a.name,
    phone: a.phone,
    addressLine: a.addressLine,
    city: a.city,
    state: a.state,
    pincode: a.pincode,
    isDefault: !!a.isDefault,
  };
}

/** `p` is a lean product with `category` populated ({_id,name}) or a bare id. */
function product(p) {
  const cat =
    p.category && p.category.name !== undefined
      ? { id: idOf(p.category), name: p.category.name }
      : { id: idOf(p.category), name: null };
  const discounted = p.discountedPrice === undefined ? null : p.discountedPrice;
  return {
    id: String(p._id),
    name: p.name,
    description: p.description,
    price: p.price,
    discountedPrice: discounted,
    effectivePrice: effectivePrice({ price: p.price, discountedPrice: discounted }),
    category: cat,
    stock: p.stock,
    stockStatus: stockStatus(p.stock),
    images: p.images,
    featured: !!p.featured,
    createdAt: p.createdAt,
  };
}

function orderItem(i) {
  return {
    productId: i.product ? String(i.product) : null,
    name: i.name,
    image: i.image,
    unitPrice: i.unitPrice,
    quantity: i.quantity,
    lineTotal: i.lineTotal,
  };
}

function order(o, { admin = false } = {}) {
  const out = {
    id: String(o._id),
    orderNumber: o.orderNumber,
    items: o.items.map(orderItem),
    address: o.address
      ? {
          name: o.address.name,
          phone: o.address.phone,
          addressLine: o.address.addressLine,
          city: o.address.city,
          state: o.address.state,
          pincode: o.address.pincode,
        }
      : null,
    paymentMethod: o.paymentMethod,
    paymentStatus: o.paymentStatus,
    subtotal: o.subtotal,
    deliveryCharge: o.deliveryCharge,
    grandTotal: o.grandTotal,
    status: o.status,
    statusHistory: o.statusHistory.map((h) => ({ status: h.status, at: h.at })),
    createdAt: o.createdAt,
  };
  if (admin) {
    const u = o.user && o.user._id ? o.user : null;
    out.customer = u
      ? { id: String(u._id), name: u.name, email: u.email, phone: u.phone || '' }
      : { id: o.user ? String(o.user) : null, name: 'Deleted user', email: '', phone: '' };
  }
  return out;
}

function orderSummary(o) {
  return {
    id: String(o._id),
    orderNumber: o.orderNumber,
    createdAt: o.createdAt,
    grandTotal: o.grandTotal,
    status: o.status,
    itemCount: o.items.reduce((s, i) => s + i.quantity, 0),
    paymentMethod: o.paymentMethod,
  };
}

module.exports = { user, address, product, order, orderSummary, stockStatus };
