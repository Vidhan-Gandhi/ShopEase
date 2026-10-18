const express = require('express');
const { authenticate, requireAdmin, requireCustomer } = require('../middleware/auth');
const auth = require('../controllers/authController');
const profile = require('../controllers/profileController');
const address = require('../controllers/addressController');
const catalog = require('../controllers/catalogController');
const cart = require('../controllers/cartController');
const orders = require('../controllers/orderController');
const admin = require('../controllers/adminController');
const testHelpers = require('../controllers/testController');

const router = express.Router();

router.get('/health', (req, res) => res.json({ status: 'ok' }));

// Auth
router.post('/auth/signup', auth.signup);
router.post('/auth/login', auth.login);
router.post('/auth/verify-email', auth.verifyEmail);
router.post('/auth/resend-verification', auth.resendVerification);

// Test-only helpers (ONC-001): answer 404 unless NODE_ENV=test
router.get('/test/emails', testHelpers.listEmails);
router.delete('/test/emails', testHelpers.clearEmails);

// Profile
router.get('/profile', authenticate, profile.getProfile);
router.put('/profile', authenticate, profile.updateProfile);
router.put('/profile/password', authenticate, profile.changePassword);

// Addresses
router.get('/addresses', authenticate, address.listAddresses);
router.post('/addresses', authenticate, address.createAddress);
router.put('/addresses/:id', authenticate, address.updateAddress);
router.patch('/addresses/:id/default', authenticate, address.makeDefault);
router.delete('/addresses/:id', authenticate, address.deleteAddress);

// Catalogue (public)
router.get('/categories', catalog.listCategories);
router.get('/products', catalog.listProducts);
router.get('/products/featured', catalog.featuredProducts);
router.get('/products/:id', catalog.getProduct);

// Cart
router.post('/cart/validate', cart.validateGuestCart);
router.get('/cart', authenticate, requireCustomer, cart.getCart);
router.post('/cart/items', authenticate, requireCustomer, cart.addItem);
router.put('/cart/items/:productId', authenticate, requireCustomer, cart.updateItem);
router.delete('/cart/items/:productId', authenticate, requireCustomer, cart.removeItem);
router.post('/cart/merge', authenticate, requireCustomer, cart.mergeCart);

// Orders (customer)
router.post('/orders/check', authenticate, requireCustomer, orders.checkOrder);
router.post('/orders', authenticate, requireCustomer, orders.placeOrder);
router.get('/orders', authenticate, requireCustomer, orders.listOrders);
router.get('/orders/:id', authenticate, requireCustomer, orders.getOrder);
router.post('/orders/:id/cancel', authenticate, requireCustomer, orders.cancelOrder);

// Admin
router.use('/admin', authenticate, requireAdmin);
router.get('/admin/dashboard', admin.dashboard);
router.get('/admin/products', admin.listProducts);
router.post('/admin/products', admin.createProduct);
router.get('/admin/products/:id', admin.getProduct);
router.put('/admin/products/:id', admin.updateProduct);
router.delete('/admin/products/:id', admin.deleteProduct);
router.post('/admin/categories', admin.createCategory);
router.put('/admin/categories/:id', admin.updateCategory);
router.delete('/admin/categories/:id', admin.deleteCategory);
router.get('/admin/orders', admin.listOrders);
router.get('/admin/orders/:id', admin.getOrder);
router.patch('/admin/orders/:id/status', admin.updateOrderStatus);

module.exports = router;
