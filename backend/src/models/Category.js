const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema(
  { name: { type: String, required: true, trim: true, minlength: 2, maxlength: 40 } },
  { timestamps: true }
);
categorySchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

module.exports = mongoose.model('Category', categorySchema);
