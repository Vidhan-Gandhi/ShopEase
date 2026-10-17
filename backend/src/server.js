require('dotenv').config();
const mongoose = require('mongoose');
const app = require('./app');
const connectDB = require('./config/db');

async function start() {
  if (!process.env.JWT_SECRET) {
    console.error('JWT_SECRET is not set. Copy .env.example to .env and set it.');
    process.exit(1);
  }
  try {
    await connectDB();
  } catch (err) {
    console.error(`Could not connect to MongoDB at ${process.env.MONGODB_URI}: ${err.message}`);
    process.exit(1);
  }
  // make sure unique indexes exist before serving traffic
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  const port = process.env.PORT || 5000;
  app.listen(port, () => console.log(`ShopEase API listening on http://localhost:${port}`));
}

start();
