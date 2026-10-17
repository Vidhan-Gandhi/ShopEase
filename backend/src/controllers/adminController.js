const Category = require('../models/Category');
const Product = require('../models/Product');
const Order = require('../models/Order');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const orderService = require('../utils/orderService');
const serialize = require('../utils/serializers');
const { fromPaise } = require('../utils/money');
const { presentProducts } = require('./catalogController');
const v = require('../validators');
const { parse } = require('../middleware/validate');

const PAGE_SIZE = 10;
const CI = { locale: 'en', strength: 2 };
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pageOf = (q) => (q.page ? Number(q.page) : 1);
const envelope = (items, page, total) => ({ items, page, limit: PAGE_SIZE, total, totalPages: Math.ceil(total / PAGE_SIZE) });

/* ---------------- dashboard ---------------- */
const dashboard = asyncHandler(async (req, res) => {
  const [totalOrders, revenueAgg, totalProducts, low, recent] = await Promise.all([
    Order.countDocuments(),
    Order.aggregate([{ $match: { status: { $ne: 'Cancelled' } } }, { $group: { _id: null, total: { $sum: { $round: [{ $multiply: ['$grandTotal', 100] }, 0] } } } }]),
    Product.countDocuments(),
    Product.find({ stock: { $lte: 5 } }).sort({ stock: 1, name: 1 }).select('name stock').lean(),
    Order.find().sort({ createdAt: -1, _id: -1 }).limit(5).populate('user', 'name').lean(),
  ]);
  res.json({
    totalOrders,
    totalRevenue: revenueAgg.length ? fromPaise(revenueAgg[0].total) : 0,
    totalProducts,
    lowStockProducts: low.map((p) => ({ id: String(p._id), name: p.name, stock: p.stock })),
    recentOrders: recent.map((o) => ({
      id: String(o._id),
      orderNumber: o.orderNumber,
      customerName: o.user && o.user.name ? o.user.name : 'Deleted user',
      grandTotal: o.grandTotal,
      status: o.status,
      createdAt: o.createdAt,
    })),
  });
});

/* ---------------- products ---------------- */
const listProducts = asyncHandler(async (req, res) => {
  const query = parse(v.adminProductQuery, req.query);
  const page = pageOf(query);
  const filter = {};
  const q = (query.q || '').trim();
  if (q) filter.name = { $regex: escapeRegex(q), $options: 'i' };
  const [items, total] = await Promise.all([
    Product.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .lean(),
    Product.countDocuments(filter),
  ]);
  res.json(envelope(await presentProducts(items), page, total));
});

const getProduct = asyncHandler(async (req, res) => {
  const p = v.isObjectId(req.params.id) ? await Product.findById(req.params.id).lean() : null;
  if (!p) throw new ApiError(404, 'Product not found');
  const [presented] = await presentProducts([p]);
  res.json({ product: presented });
});

async function productFields(body) {
  const category = await Category.exists({ _id: body.category });
  if (!category) throw new ApiError(400, 'Validation failed', [{ field: 'category', message: 'Category does not exist' }]);
  return {
    name: body.name,
    description: body.description,
    price: body.price,
    discountedPrice: body.discountedPrice === undefined ? null : body.discountedPrice,
    category: body.category,
    stock: body.stock,
    images: body.images,
    featured: body.featured,
  };
}

const createProduct = asyncHandler(async (req, res) => {
  const body = parse(v.productBody, req.body);
  const created = await Product.create(await productFields(body));
  const [presented] = await presentProducts([created.toObject()]);
  res.status(201).json({ product: presented });
});

const updateProduct = asyncHandler(async (req, res) => {
  const exists = v.isObjectId(req.params.id) ? await Product.exists({ _id: req.params.id }) : null;
  if (!exists) throw new ApiError(404, 'Product not found');
  const body = parse(v.productBody, req.body);
  const updated = await Product.findByIdAndUpdate(req.params.id, { $set: await productFields(body) }, { new: true, runValidators: true }).lean();
  if (!updated) throw new ApiError(404, 'Product not found');
  const [presented] = await presentProducts([updated]);
  res.json({ product: presented });
});

const deleteProduct = asyncHandler(async (req, res) => {
  const deleted = v.isObjectId(req.params.id) ? await Product.findByIdAndDelete(req.params.id) : null;
  if (!deleted) throw new ApiError(404, 'Product not found');
  res.json({ message: 'Product deleted' });
});

/* ---------------- categories ---------------- */
const dupCategory = () =>
  new ApiError(409, 'A category with this name already exists', [{ field: 'name', message: 'A category with this name already exists' }]);
const categoryNotFound = () => new ApiError(404, 'Category not found');

async function categoryView(c) {
  return { id: String(c._id), name: c.name, productCount: await Product.countDocuments({ category: c._id }) };
}

const createCategory = asyncHandler(async (req, res) => {
  const { name } = parse(v.categoryBody, req.body);
  if (await Category.findOne({ name }).collation(CI).select('_id')) throw dupCategory();
  let created;
  try {
    created = await Category.create({ name });
  } catch (e) {
    if (e && e.code === 11000) throw dupCategory();
    throw e;
  }
  res.status(201).json({ category: await categoryView(created) });
});

const updateCategory = asyncHandler(async (req, res) => {
  const cat = v.isObjectId(req.params.id) ? await Category.findById(req.params.id) : null;
  if (!cat) throw categoryNotFound();
  const { name } = parse(v.categoryBody, req.body);
  const clash = await Category.findOne({ name, _id: { $ne: cat._id } }).collation(CI).select('_id');
  if (clash) throw dupCategory();
  cat.name = name;
  try {
    await cat.save();
  } catch (e) {
    if (e && e.code === 11000) throw dupCategory();
    throw e;
  }
  res.json({ category: await categoryView(cat) });
});

const deleteCategory = asyncHandler(async (req, res) => {
  const cat = v.isObjectId(req.params.id) ? await Category.findById(req.params.id) : null;
  if (!cat) throw categoryNotFound();
  if (await Product.exists({ category: cat._id })) throw new ApiError(409, 'Cannot delete a category that still has products');
  await cat.deleteOne();
  res.json({ message: 'Category deleted' });
});

/* ---------------- orders ---------------- */
const listOrders = asyncHandler(async (req, res) => {
  const query = parse(v.adminOrderQuery, req.query);
  const page = pageOf(query);
  const filter = query.status && query.status !== 'All' ? { status: query.status } : {};
  const [items, total] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .populate('user', 'name email phone')
      .lean(),
    Order.countDocuments(filter),
  ]);
  res.json(envelope(items.map((o) => serialize.order(o, { admin: true })), page, total));
});

const getOrder = asyncHandler(async (req, res) => {
  const o = v.isObjectId(req.params.id) ? await Order.findById(req.params.id).populate('user', 'name email phone').lean() : null;
  if (!o) throw new ApiError(404, 'Order not found');
  res.json({ order: serialize.order(o, { admin: true }) });
});

const updateOrderStatus = asyncHandler(async (req, res) => {
  const found = v.isObjectId(req.params.id) ? await Order.findById(req.params.id).select('status') : null;
  if (!found) throw new ApiError(404, 'Order not found');
  const { status } = parse(v.statusBody, req.body);
  orderService.assertTransitionAllowed(found.status, status);
  const updated = await orderService.transition({ _id: found._id }, found.status, status);
  if (!updated) {
    // lost a race with another request: report against the real current status
    const now = await Order.findById(found._id).select('status');
    throw new ApiError(409, `Cannot change status from ${now ? now.status : found.status} to ${status}`);
  }
  const populated = await Order.findById(updated._id).populate('user', 'name email phone').lean();
  res.json({ order: serialize.order(populated, { admin: true }) });
});

module.exports = {
  dashboard,
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  createCategory,
  updateCategory,
  deleteCategory,
  listOrders,
  getOrder,
  updateOrderStatus,
};
