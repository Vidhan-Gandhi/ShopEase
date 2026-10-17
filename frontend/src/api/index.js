import { request } from './client'

const e = encodeURIComponent

export const authApi = {
  signup: (body) => request('POST', '/auth/signup', { body, auth: false }),
  login: (body) => request('POST', '/auth/login', { body, auth: false }),
}

export const profileApi = {
  get: () => request('GET', '/profile'),
  update: (body) => request('PUT', '/profile', { body }),
  changePassword: (body) => request('PUT', '/profile/password', { body }),
}

export const addressApi = {
  list: () => request('GET', '/addresses'),
  create: (body) => request('POST', '/addresses', { body }),
  update: (id, body) => request('PUT', `/addresses/${e(id)}`, { body }),
  setDefault: (id) => request('PATCH', `/addresses/${e(id)}/default`),
  remove: (id) => request('DELETE', `/addresses/${e(id)}`),
}

export const catalogApi = {
  categories: () => request('GET', '/categories', { auth: false }),
  featured: () => request('GET', '/products/featured', { auth: false }),
  products: (params) => request('GET', '/products', { params, auth: false }),
  product: (id) => request('GET', `/products/${e(id)}`, { auth: false }),
}

export const cartApi = {
  validate: (items) => request('POST', '/cart/validate', { body: { items }, auth: false }),
  get: () => request('GET', '/cart'),
  add: (productId, quantity) => request('POST', '/cart/items', { body: { productId, quantity } }),
  setQuantity: (productId, quantity) => request('PUT', `/cart/items/${e(productId)}`, { body: { quantity } }),
  remove: (productId) => request('DELETE', `/cart/items/${e(productId)}`),
  merge: (items) => request('POST', '/cart/merge', { body: { items } }),
}

export const orderApi = {
  check: (body) => request('POST', '/orders/check', { body }),
  place: (body) => request('POST', '/orders', { body }),
  list: (page) => request('GET', '/orders', { params: { page } }),
  get: (id) => request('GET', `/orders/${e(id)}`),
  cancel: (id) => request('POST', `/orders/${e(id)}/cancel`),
}

export const adminApi = {
  dashboard: () => request('GET', '/admin/dashboard'),
  products: (params) => request('GET', '/admin/products', { params }),
  product: (id) => request('GET', `/admin/products/${e(id)}`),
  createProduct: (body) => request('POST', '/admin/products', { body }),
  updateProduct: (id, body) => request('PUT', `/admin/products/${e(id)}`, { body }),
  deleteProduct: (id) => request('DELETE', `/admin/products/${e(id)}`),
  createCategory: (body) => request('POST', '/admin/categories', { body }),
  updateCategory: (id, body) => request('PUT', `/admin/categories/${e(id)}`, { body }),
  deleteCategory: (id) => request('DELETE', `/admin/categories/${e(id)}`),
  orders: (params) => request('GET', '/admin/orders', { params }),
  order: (id) => request('GET', `/admin/orders/${e(id)}`),
  setOrderStatus: (id, status) => request('PATCH', `/admin/orders/${e(id)}/status`, { body: { status } }),
}
