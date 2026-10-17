const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
    description: { type: String, required: true, trim: true, maxlength: 2000 },
    price: { type: Number, required: true, min: 0.01, max: 10000000 },
    discountedPrice: { type: Number, default: null, min: 0.01 },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true, index: true },
    stock: { type: Number, required: true, min: 0, max: 100000, validate: Number.isInteger, index: true },
    images: {
      type: [String],
      validate: (v) => Array.isArray(v) && v.length >= 1 && v.length <= 8,
    },
    featured: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);
productSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Product', productSchema);
