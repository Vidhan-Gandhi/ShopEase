const mongoose = require('mongoose');

const STATUSES = ['Placed', 'Confirmed', 'Shipped', 'Delivered', 'Cancelled'];

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true, unique: true, match: /^SE-\d{8}-[A-Z0-9]{4}$/ },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    items: [
      {
        _id: false,
        product: { type: mongoose.Schema.Types.ObjectId },
        name: { type: String, required: true },
        image: { type: String, default: '' },
        unitPrice: { type: Number, required: true },
        quantity: { type: Number, required: true },
        lineTotal: { type: Number, required: true },
      },
    ],
    address: {
      _id: false,
      name: String,
      phone: String,
      addressLine: String,
      city: String,
      state: String,
      pincode: String,
    },
    paymentMethod: { type: String, enum: ['Cash on Delivery', 'Online payment'], required: true },
    paymentStatus: { type: String, enum: ['Pending (pay on delivery)', 'Paid (simulated)'], required: true },
    subtotal: { type: Number, required: true },
    deliveryCharge: { type: Number, required: true },
    grandTotal: { type: Number, required: true },
    status: { type: String, enum: STATUSES, default: 'Placed', index: true },
    statusHistory: [{ _id: false, status: { type: String, enum: STATUSES }, at: { type: Date, default: Date.now } }],
  },
  { timestamps: true }
);
orderSchema.index({ createdAt: -1 });

const Order = mongoose.model('Order', orderSchema);
Order.STATUSES = STATUSES;
module.exports = Order;
