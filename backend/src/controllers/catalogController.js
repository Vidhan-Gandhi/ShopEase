const mongoose = require('mongoose');
const Category = require('../models/Category');
const Product = require('../models/Product');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const serialize = require('../utils/serializers');
const v = require('../validators');
const { parse } = require('../middleware/validate');

const PAGE_SIZE = 12;
const CI = { locale: 'en', strength: 2 };

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Replace lean product `category` ids by {_id,name} and serialise. */
async function presentProducts(products) {
  const ids = [...new Set(products.map((p) => String(p.category)))];
  const cats = await Category.find({ _id: { $in: ids } }).select('name').lean();
  const byId = new Map(cats.map((c) => [String(c._id), c]));
  return products.map((p) => serialize.product({ ...p, category: byId.get(String(p.category)) || p.category }));
}

const listCategories = asyncHandler(async (req, res) => {
  const [cats, counts] = await Promise.all([
    Category.find().collation(CI).sort({ name: 1 }).lean(),
    Product.aggregate([{ $group: { _id: '$category', n: { $sum: 1 } } }]),
  ]);
  const countBy = new Map(counts.map((c) => [String(c._id), c.n]));
  res.json({ items: cats.map((c) => ({ id: String(c._id), name: c.name, productCount: countBy.get(String(c._id)) || 0 })) });
});

const SORTS = {
  newest: { createdAt: -1, _id: -1 },
  price_asc: { effectivePrice: 1, _id: 1 },
  price_desc: { effectivePrice: -1, _id: 1 },
  name_asc: { name: 1, _id: 1 },
};

const listProducts = asyncHandler(async (req, res) => {
  const query = parse(v.productQuery, req.query);
  const page = query.page ? Number(query.page) : 1;
  const match = {};
  const q = (query.q || '').trim();
  if (q) match.name = { $regex: escapeRegex(q), $options: 'i' };
  if (query.category) match.category = new mongoose.Types.ObjectId(query.category);
  const price = {};
  if (query.minPrice !== undefined) price.$gte = Number(query.minPrice);
  if (query.maxPrice !== undefined) price.$lte = Number(query.maxPrice);
  const postMatch = Object.keys(price).length ? { effectivePrice: price } : {};

  const [result] = await Product.aggregate([
    { $match: match },
    { $addFields: { effectivePrice: { $ifNull: ['$discountedPrice', '$price'] } } },
    { $match: postMatch },
    {
      $facet: {
        items: [{ $sort: SORTS[query.sort || 'newest'] }, { $skip: (page - 1) * PAGE_SIZE }, { $limit: PAGE_SIZE }],
        total: [{ $count: 'n' }],
      },
    },
  ]).collation(CI);

  const total = result.total.length ? result.total[0].n : 0;
  res.json({
    items: await presentProducts(result.items),
    page,
    limit: PAGE_SIZE,
    total,
    totalPages: Math.ceil(total / PAGE_SIZE),
  });
});

const featuredProducts = asyncHandler(async (req, res) => {
  const items = await Product.find({ featured: true }).sort({ createdAt: -1, _id: -1 }).limit(8).lean();
  res.json({ items: await presentProducts(items) });
});

const getProduct = asyncHandler(async (req, res) => {
  if (!v.isObjectId(req.params.id)) throw new ApiError(404, 'Product not found');
  const product = await Product.findById(req.params.id).lean();
  if (!product) throw new ApiError(404, 'Product not found');
  const [presented] = await presentProducts([product]);
  res.json({ product: presented });
});

module.exports = { listCategories, listProducts, featuredProducts, getProduct, presentProducts, PAGE_SIZE };
