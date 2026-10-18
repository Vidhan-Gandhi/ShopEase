require('dotenv').config();
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const User = require('./models/User');
const Category = require('./models/Category');
const Product = require('./models/Product');
const Cart = require('./models/Cart');
const Order = require('./models/Order');
const { generateOrderNumber } = require('./utils/orderNumber');
const { toPaise, fromPaise, effectivePrice, deliveryForPaise } = require('./utils/money');

const creds = {
  adminEmail: process.env.SEED_ADMIN_EMAIL || 'admin@shopease.com',
  adminPassword: process.env.SEED_ADMIN_PASSWORD || 'Admin@123',
  c1Email: process.env.SEED_CUSTOMER1_EMAIL || 'asha@example.com',
  c2Email: process.env.SEED_CUSTOMER2_EMAIL || 'ravi@example.com',
  customerPassword: process.env.SEED_CUSTOMER_PASSWORD || 'Shop1234',
};

const CATEGORIES = ['Electronics', 'Fashion', 'Books', 'Home & Kitchen', 'Sports & Fitness'];

// [name, categoryIndex, price, discountedPrice|null, stock, featured, description]
const PRODUCTS = [
  ['Wireless Bluetooth Earbuds', 0, 2499, 1799, 40, true, 'True wireless earbuds with 24-hour battery life, touch controls and a snug in-ear fit.'],
  ['Smartphone Fast Charger 20W', 0, 799, null, 120, false, '20W fast charger with a USB-C port and short-circuit protection.'],
  ['Portable Power Bank 10000mAh', 0, 1499, 1199, 3, false, 'Slim 10000mAh power bank with dual USB output and LED charge indicator.'],
  ['Smart LED TV 43 inch', 0, 28999, 24999, 15, true, '43 inch Full HD smart TV with built-in streaming apps and three HDMI ports.'],
  ['Wireless Mouse', 0, 599, null, 80, false, 'Compact 2.4 GHz wireless mouse with silent clicks and adjustable DPI.'],
  ['USB-C Cable 2m', 0, 349, null, 0, false, 'Braided 2 metre USB-C charging and data cable.'],

  ['Cotton T-Shirt', 1, 699, null, 100, true, 'Soft 100% cotton crew-neck t-shirt, available for everyday wear.'],
  ['Slim Fit Denim Jeans', 1, 1999, 1499, 60, true, 'Stretch denim jeans with a slim fit and five-pocket styling.'],
  ['Running Shoes', 1, 3499, 2799, 35, false, 'Lightweight running shoes with a cushioned sole and breathable mesh upper.'],
  ['Leather Wallet', 1, 899, null, 1, false, 'Genuine leather bi-fold wallet with card slots and a coin pocket.'],
  ['Hooded Sweatshirt', 1, 1599, null, 45, true, 'Warm fleece-lined hoodie with a kangaroo pocket.'],
  ['Analog Wrist Watch', 1, 2999, null, 25, false, 'Classic analog watch with a stainless steel case and leather strap.'],

  ['The Midnight Library', 2, 399, null, 70, true, 'A bestselling novel about the choices that make up a life.'],
  ['Atomic Habits', 2, 599, 449, 90, true, 'Practical strategies to form good habits and break bad ones.'],
  ['Python Programming Basics', 2, 799, null, 50, false, 'Beginner-friendly guide to programming with Python, with exercises.'],
  ['Indian Cookbook', 2, 549, null, 2, false, 'Over 200 classic regional recipes from across India.'],
  ['The Silent Witness Mystery Novel', 2, 299, null, 65, false, 'A gripping mystery novel with a twist on every page.'],
  ['World History Illustrated', 2, 1299, null, 0, false, 'A richly illustrated overview of world history.'],

  ['Non-stick Frying Pan', 3, 1199, 899, 55, true, '26 cm non-stick frying pan with a heat-resistant handle.'],
  ['Stainless Steel Water Bottle', 3, 499, null, 150, false, '1 litre insulated bottle that keeps drinks cold for 24 hours.'],
  ['Ceramic Dinner Set 18 pcs', 3, 2499, null, 20, false, 'Eighteen-piece ceramic dinner set, microwave and dishwasher safe.'],
  ['Electric Kettle 1.5L', 3, 1299, 999, 40, true, '1.5 litre stainless steel electric kettle with auto shut-off.'],
  ['Cotton Bedsheet Set', 3, 1799, null, 5, false, 'Double bedsheet with two pillow covers in breathable cotton.'],
  ['LED Desk Lamp', 3, 899, null, 75, false, 'Dimmable LED desk lamp with three colour modes and USB port.'],

  ['Yoga Mat 6mm', 4, 799, 599, 100, true, 'Non-slip 6mm yoga mat with a carry strap.'],
  ['Cricket Bat Kashmir Willow', 4, 2499, null, 18, false, 'Full-size Kashmir willow cricket bat with a comfortable grip.'],
  ['Dumbbell Set 10kg', 4, 1999, null, 30, true, 'Adjustable dumbbell set totalling 10 kg with anti-roll plates.'],
  ['Football Size 5', 4, 699, null, 80, false, 'Machine-stitched size 5 football for training and matches.'],
  ['Skipping Rope', 4, 249, null, 200, false, 'Adjustable speed skipping rope with ball bearings.'],
  ['Badminton Racket Pair', 4, 1299, 999, 28, false, 'Pair of graphite badminton rackets with cover and shuttlecocks.'],
];

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

function imagesFor(name, index) {
  const count = 2 + (index % 3); // 2-4 images
  return Array.from({ length: count }, (_, i) => `https://picsum.photos/seed/${slug(name)}-${i + 1}/600/600`);
}

const ADDRESSES = {
  asha: [
    { name: 'Asha Rao', phone: '9876543210', addressLine: '12 MG Road, Camp', city: 'Pune', state: 'Maharashtra', pincode: '411001', isDefault: true },
    { name: 'Asha Rao', phone: '9876543210', addressLine: 'Flat 4B, Lake View Apartments', city: 'Mumbai', state: 'Maharashtra', pincode: '400076', isDefault: false },
  ],
  ravi: [
    { name: 'Ravi Kumar', phone: '9123456780', addressLine: '45 Brigade Road', city: 'Bengaluru', state: 'Karnataka', pincode: '560001', isDefault: true },
  ],
};

const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

async function run() {
  try {
    await connectDB();
  } catch (err) {
    console.error(`Seed failed: could not connect to MongoDB at ${process.env.MONGODB_URI} (${err.message}). Is MongoDB running?`);
    process.exit(1);
  }

  await Promise.all([User, Category, Product, Cart, Order].map((m) => m.init()));
  await Promise.all([User, Category, Product, Cart, Order].map((m) => m.deleteMany({})));

  const hashAdmin = await bcrypt.hash(creds.adminPassword, 10);
  const hashCustomer = await bcrypt.hash(creds.customerPassword, 10);
  await User.create({ name: 'ShopEase Admin', email: creds.adminEmail, password: hashAdmin, role: 'admin', emailVerified: true });
  const asha = await User.create({
    name: 'Asha Rao', email: creds.c1Email, password: hashCustomer, role: 'customer', emailVerified: true, phone: '9876543210', addresses: ADDRESSES.asha,
  });
  const ravi = await User.create({
    name: 'Ravi Kumar', email: creds.c2Email, password: hashCustomer, role: 'customer', emailVerified: true, phone: '9123456780', addresses: ADDRESSES.ravi,
  });

  const cats = await Category.insertMany(CATEGORIES.map((name) => ({ name })));

  const products = [];
  for (let i = 0; i < PRODUCTS.length; i += 1) {
    const [name, ci, price, discountedPrice, stock, featured, description] = PRODUCTS[i];
    // small createdAt offsets so "newest" ordering is deterministic
    const createdAt = new Date(Date.now() - (PRODUCTS.length - i) * 60 * 1000);
    products.push({ name, description, price, discountedPrice, stock, featured, category: cats[ci]._id, images: imagesFor(name, i), createdAt, updatedAt: createdAt });
  }
  const created = await Product.insertMany(products, { timestamps: false });
  const byName = new Map(created.map((p) => [p.name, p]));

  // [customer, status, paymentKey, items [[productName, qty]], daysAgo]
  const ORDERS = [
    [asha, 'Placed', 'COD', [['Cotton T-Shirt', 2]], 1],
    [asha, 'Confirmed', 'ONLINE', [['Yoga Mat 6mm', 1], ['Skipping Rope', 1]], 3],
    [asha, 'Shipped', 'ONLINE', [['The Silent Witness Mystery Novel', 1]], 5],
    [asha, 'Delivered', 'ONLINE', [['Running Shoes', 1]], 9],
    [ravi, 'Cancelled', 'COD', [['Wireless Mouse', 2]], 7],
    [ravi, 'Placed', 'COD', [['Stainless Steel Water Bottle', 1], ['Atomic Habits', 1]], 0],
  ];
  const FLOW = ['Placed', 'Confirmed', 'Shipped', 'Delivered'];
  const METHODS = {
    COD: { paymentMethod: 'Cash on Delivery', paymentStatus: 'Pending (pay on delivery)' },
    ONLINE: { paymentMethod: 'Online payment', paymentStatus: 'Paid (simulated)' },
  };

  for (const [customer, status, pay, lines, ago] of ORDERS) {
    const placedAt = daysAgo(ago);
    const items = lines.map(([name, quantity]) => {
      const p = byName.get(name);
      const unitPrice = effectivePrice(p);
      return { product: p._id, name: p.name, image: p.images[0], unitPrice, quantity, lineTotal: fromPaise(toPaise(unitPrice) * quantity) };
    });
    const subtotalPaise = items.reduce((s, i) => s + toPaise(i.lineTotal), 0);
    const deliveryPaise = deliveryForPaise(subtotalPaise, true);
    const history = [{ status: 'Placed', at: placedAt }];
    if (status === 'Cancelled') {
      history.push({ status: 'Cancelled', at: new Date(placedAt.getTime() + 2 * 60 * 60 * 1000) });
    } else {
      for (let i = 1; i <= FLOW.indexOf(status); i += 1) {
        history.push({ status: FLOW[i], at: new Date(placedAt.getTime() + i * 6 * 60 * 60 * 1000) });
      }
    }
    const addr = customer.addresses.find((a) => a.isDefault) || customer.addresses[0];
    await Order.create({
      orderNumber: generateOrderNumber(placedAt),
      user: customer._id,
      items,
      address: { name: addr.name, phone: addr.phone, addressLine: addr.addressLine, city: addr.city, state: addr.state, pincode: addr.pincode },
      ...METHODS[pay],
      subtotal: fromPaise(subtotalPaise),
      deliveryCharge: fromPaise(deliveryPaise),
      grandTotal: fromPaise(subtotalPaise + deliveryPaise),
      status,
      statusHistory: history,
      createdAt: placedAt,
      updatedAt: history[history.length - 1].at,
    });
    if (status !== 'Cancelled') {
      for (const [name, quantity] of lines) {
        await Product.updateOne({ _id: byName.get(name)._id }, { $inc: { stock: -quantity } });
      }
    }
  }

  const counts = {
    admins: await User.countDocuments({ role: 'admin' }),
    customers: await User.countDocuments({ role: 'customer' }),
    categories: await Category.countDocuments(),
    products: await Product.countDocuments(),
    orders: await Order.countDocuments(),
  };
  console.log('Seed complete:', JSON.stringify(counts));
  console.log(`Admin: ${creds.adminEmail} / ${creds.adminPassword}`);
  console.log(`Customers: ${creds.c1Email}, ${creds.c2Email} / ${creds.customerPassword}`);
  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error('Seed failed:', err.message);
  try {
    await mongoose.disconnect();
  } catch (e) {
    /* ignore */
  }
  process.exit(1);
});
