const h = require('./helpers');
const { test, expect } = h;

async function adminPage(page, path) {
  await h.setSession(page, await h.adminToken(), path);
}
async function searchAdminProducts(page, name) {
  await page.getByTestId('admin-products-search').fill(name);
  await page.getByTestId('admin-products-search-submit').click();
}

test.describe('FR-025 admin dashboard (UI)', () => {
  test('TC-268 dashboard shows total orders, revenue (excl. cancelled), product count, low-stock products and the 5 most recent orders', async ({ page }) => {
    const p = await h.createProduct({ price: 600, stock: 3, name: 'Low Stock Dash ' + h.uid() });
    const c = await h.customerWithAddress({ name: 'Dash Buyer' });
    for (let i = 0; i < 2; i++) await h.placeOrder(c, [[p, 1]]);
    const api = (await h.api('GET', '/admin/dashboard', { token: await h.adminToken() })).body;
    await adminPage(page, '/admin');
    await expect(page.getByTestId('dashboard-total-orders')).toContainText(String(api.totalOrders));
    await expect(page.getByTestId('dashboard-total-revenue')).toContainText(h.money(api.totalRevenue));
    await expect(page.getByTestId('dashboard-total-products')).toContainText(String(api.totalProducts));
    await expect(page.getByTestId('dashboard-low-stock-item')).toHaveCount(api.lowStockProducts.length);
    await expect(page.getByTestId('dashboard-low-stock-list')).toContainText(p.name);
    await expect(page.getByTestId('dashboard-recent-order-item')).toHaveCount(5);
    await expect(page.getByTestId('dashboard-recent-order-item').first()).toContainText(api.recentOrders[0].orderNumber);
    await expect(page.getByTestId('dashboard-recent-order-item').first()).toContainText('Dash Buyer');
    await expect(page.getByTestId('dashboard-recent-order-item').first()).toContainText('Placed');
  });

  test('TC-295 with no orders the dashboard shows "No orders yet", 0 orders and ₹0.00 revenue', async ({ page }) => {
    await page.route('**/api/admin/dashboard', (r) => r.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ totalOrders: 0, totalRevenue: 0, totalProducts: 12, lowStockProducts: [], recentOrders: [] }),
    }));
    await adminPage(page, '/admin');
    await expect(page.getByTestId('dashboard-total-orders')).toContainText('0');
    await expect(page.getByTestId('dashboard-total-revenue')).toContainText('₹0.00');
    await expect(page.getByTestId('dashboard-orders-empty')).toContainText('No orders yet');
    await expect(page.getByTestId('dashboard-low-stock-empty')).toBeVisible();
  });
});

test.describe('FR-026 admin products (UI)', () => {
  test('TC-269 creating a product through the form lists it in admin and makes it visible and purchasable in the storefront', async ({ page }) => {
    await adminPage(page, '/admin/products/new');
    const name = 'Created In UI ' + h.uid();
    await page.getByTestId('product-form-name').fill(name);
    await page.getByTestId('product-form-description').fill('Made by the E2E suite');
    await page.getByTestId('product-form-price').fill('999');
    await page.getByTestId('product-form-discounted-price').fill('799');
    await page.getByTestId('product-form-category').selectOption({ label: 'Books' });
    await page.getByTestId('product-form-stock').fill('12');
    await page.getByTestId('product-form-images').fill(h.IMG + '?a=1\n' + h.IMG + '?a=2');
    await page.getByTestId('product-form-submit').click();
    await expect(page).toHaveURL(/\/admin\/products$/);
    await searchAdminProducts(page, name);
    await expect(page.getByTestId('admin-products-item')).toHaveCount(1);
    await expect(page.getByTestId('admin-products-item')).toContainText('₹799.00');
    const found = (await h.api('GET', '/products?q=' + encodeURIComponent(name))).body.items[0];
    expect(found).toMatchObject({ price: 999, discountedPrice: 799, stock: 12 });
    expect(found.images).toHaveLength(2);
    await page.evaluate((k) => localStorage.removeItem(k), h.TOKEN_KEY); // browse as a guest (admins cannot buy)
    await page.goto('/products/' + found.id);
    await expect(page.getByTestId('product-name')).toContainText(name);
    await expect(page.getByTestId('product-add-to-cart')).toBeEnabled();
  });

  test('TC-270 submitting an empty product form, or a discounted price >= price, is blocked with per-field messages', async ({ page }) => {
    await adminPage(page, '/admin/products/new');
    await page.getByTestId('product-form-submit').click();
    for (const f of ['name', 'description', 'price', 'category', 'images']) {
      await expect(page.getByTestId(`product-form-${f}-error`)).toBeVisible();
    }
    await expect(page.getByTestId('product-form-name-error')).toContainText('Name is required');
    await expect(page.getByTestId('product-form-images-error')).toContainText('At least one image URL is required');
    await page.getByTestId('product-form-name').fill('Bad Product');
    await page.getByTestId('product-form-description').fill('desc');
    await page.getByTestId('product-form-price').fill('500');
    await page.getByTestId('product-form-discounted-price').fill('500');
    await page.getByTestId('product-form-stock').fill('-1');
    await page.getByTestId('product-form-images').fill('ftp://x');
    await page.getByTestId('product-form-submit').click();
    await expect(page.getByTestId('product-form-discounted-price-error')).toContainText('Discounted price must be less than price');
    await expect(page.getByTestId('product-form-stock-error')).toBeVisible();
    await expect(page.getByTestId('product-form-images-error')).toBeVisible();
    await page.getByTestId('product-form-discounted-price').fill('600');
    await page.getByTestId('product-form-submit').click();
    await expect(page.getByTestId('product-form-discounted-price-error')).toContainText('Discounted price must be less than price');
    expect((await h.api('GET', '/products?q=Bad%20Product')).body.items).toEqual([]);
  });

  test('TC-271 editing price and stock in the form and saving updates the storefront', async ({ page }) => {
    const p = await h.createProduct({ price: 500, stock: 10, name: 'Edit Me ' + h.uid() });
    await adminPage(page, `/admin/products/${p.id}/edit`);
    await expect(page.getByTestId('product-form-name')).toHaveValue(p.name);
    await page.getByTestId('product-form-price').fill('650');
    await page.getByTestId('product-form-stock').fill('3');
    await page.getByTestId('product-form-submit').click();
    await expect(page).toHaveURL(/\/admin\/products$/);
    await page.goto('/products/' + p.id);
    await expect(page.getByTestId('product-price')).toContainText('₹650.00');
    await expect(page.getByTestId('product-stock')).toContainText('Only 3 left');
  });

  test('TC-272 deleting a product asks for confirmation: Cancel / Esc keep it, the confirm button deletes it', async ({ page }) => {
    const p = await h.createProduct({ name: 'Delete Me ' + h.uid() });
    await adminPage(page, '/admin/products');
    await searchAdminProducts(page, p.name);
    await expect(page.getByTestId('admin-products-item')).toHaveCount(1);
    await page.getByTestId('admin-products-delete').click();
    await expect(page.getByTestId('confirm-dialog')).toBeVisible();
    await page.getByTestId('confirm-dialog-cancel').click();
    await expect(page.getByTestId('confirm-dialog')).toHaveCount(0);
    expect((await h.api('GET', '/products/' + p.id)).status).toBe(200);
    await page.getByTestId('admin-products-delete').click();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('confirm-dialog')).toHaveCount(0);
    expect((await h.api('GET', '/products/' + p.id)).status).toBe(200);
    await page.getByTestId('admin-products-delete').click();
    await page.getByTestId('confirm-dialog-confirm').click();
    await expect(page.getByTestId('admin-products-item')).toHaveCount(0);
    expect((await h.api('GET', '/products/' + p.id)).status).toBe(404);
  });

  test('TC-279 the admin product list shows 10 rows per page with a total and page controls', async ({ page }) => {
    for (let i = 0; i < 2; i++) await h.createProduct();
    const total = (await h.api('GET', '/admin/products', { token: await h.adminToken() })).body.total;
    expect(total).toBeGreaterThan(10);
    await adminPage(page, '/admin/products');
    await expect(page.getByTestId('admin-products-item')).toHaveCount(10);
    const totalNow = (await h.api('GET', '/admin/products', { token: await h.adminToken() })).body.total;
    await expect(page.getByTestId('admin-products-total')).toContainText(String(totalNow));
    await expect(page.getByTestId('admin-products-pagination')).toBeVisible();
    await page.getByTestId('admin-products-pagination-next').click();
    await expect(page.getByTestId('admin-products-item').first()).toBeVisible();
    await expect(page.getByTestId('admin-products-pagination-prev')).toBeEnabled();
    await searchAdminProducts(page, 'zzzz-no-such-product');
    await expect(page.getByTestId('admin-products-empty')).toBeVisible();
    await expect(page.getByTestId('admin-products-pagination')).toHaveCount(0);
  });

  test('TC-293 the product form has no file upload control (images are URLs only)', async ({ page }) => {
    await adminPage(page, '/admin/products/new');
    await expect(page.getByTestId('product-form')).toBeVisible();
    await expect(page.locator('input[type=file]')).toHaveCount(0);
    await expect(page.getByTestId('product-form-images')).toBeVisible();
  });
});

test.describe('FR-027 admin categories (UI)', () => {
  test('TC-273 the admin creates and renames a category; duplicate and too-short names show a message', async ({ page }) => {
    await adminPage(page, '/admin/categories');
    const name = 'Toys' + h.uid().slice(0, 5);
    await page.getByTestId('admin-categories-name').fill(name);
    await page.getByTestId('admin-categories-add').click();
    const item = page.getByTestId('admin-categories-item').filter({ hasText: name });
    await expect(item).toHaveCount(1);
    await page.getByTestId('admin-categories-name').fill(name.toLowerCase());
    await page.getByTestId('admin-categories-add').click();
    await expect(page.getByTestId('admin-categories-form')).toContainText('already exists');
    await page.getByTestId('admin-categories-name').fill('A');
    await page.getByTestId('admin-categories-add').click();
    await expect(page.getByTestId('admin-categories-name-error')).toBeVisible();
    const renamed = 'Games' + h.uid().slice(0, 5);
    await item.getByTestId('admin-categories-edit').click();
    await page.getByTestId('admin-categories-edit-name').fill(renamed);
    await page.getByTestId('admin-categories-edit-save').click();
    await expect(page.getByTestId('admin-categories-item').filter({ hasText: renamed })).toHaveCount(1);
    await expect(page.getByTestId('admin-categories-item').filter({ hasText: name })).toHaveCount(0);
    await page.goto('/');
    await expect(page.getByTestId('home-categories')).toContainText(renamed);
  });

  test('TC-274 deleting a category with products shows "Cannot delete a category that still has products" (dialog closes, nothing deleted); an empty one is deleted', async ({ page }) => {
    const busy = await h.createCategory('Busy' + h.uid().slice(0, 6));
    await h.createProduct({ category: busy.id });
    const empty = await h.createCategory('Empty' + h.uid().slice(0, 6));
    await adminPage(page, '/admin/categories');
    const busyRow = page.getByTestId('admin-categories-item').filter({ hasText: busy.name });
    await busyRow.getByTestId('admin-categories-delete').click();
    await expect(page.getByTestId('confirm-dialog')).toBeVisible();
    await page.getByTestId('confirm-dialog-confirm').click();
    await expect(page.getByTestId('confirm-dialog')).toHaveCount(0);
    await expect(page.getByTestId('admin-categories-action-error')).toContainText('Cannot delete a category that still has products');
    await expect(busyRow).toHaveCount(1);
    const emptyRow = page.getByTestId('admin-categories-item').filter({ hasText: empty.name });
    await emptyRow.getByTestId('admin-categories-delete').click();
    await page.getByTestId('confirm-dialog-confirm').click();
    await expect(page.getByTestId('admin-categories-item').filter({ hasText: empty.name })).toHaveCount(0);
  });
});

test.describe('FR-028 admin orders (UI)', () => {
  test('TC-275 the status filter lists only orders of that status; "All" lists every order; an empty result shows "No orders found"', async ({ page }) => {
    const p = await h.createProduct({ price: 600, stock: 30 });
    const c = await h.customerWithAddress();
    const o = await h.placeOrder(c, [[p, 1]]);
    await h.setStatus(o.id, 'Confirmed');
    await h.setStatus(o.id, 'Shipped');
    await adminPage(page, '/admin/orders');
    await expect(page.getByTestId('admin-orders-item').first()).toBeVisible();
    await page.getByTestId('admin-orders-filter').selectOption('Shipped');
    await expect(page.getByTestId('admin-orders-item').first()).toBeVisible();
    await expect.poll(async () => (await page.getByTestId('admin-orders-item-status').allInnerTexts()).every((s) => s.includes('Shipped'))).toBe(true);
    await expect(page.getByTestId('admin-orders-list')).toContainText(o.orderNumber);
    await page.getByTestId('admin-orders-filter').selectOption('All');
    const total = (await h.api('GET', '/admin/orders?status=All', { token: await h.adminToken() })).body.total;
    await expect(page.getByTestId('admin-orders-total')).toContainText(String(total));
    await page.route('**/api/admin/orders?*status=Delivered*', (r) => r.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], page: 1, limit: 10, total: 0, totalPages: 0 }),
    }));
    await page.getByTestId('admin-orders-filter').selectOption('Delivered');
    await expect(page.getByTestId('admin-orders-empty')).toContainText('No orders found');
  });

  test('TC-276 the admin moves an order Placed -> Confirmed -> Shipped -> Delivered; the button text follows the status and history grows', async ({ page }) => {
    const p = await h.createProduct({ price: 600, stock: 10 });
    const c = await h.customerWithAddress();
    const o = await h.placeOrder(c, [[p, 1]]);
    await adminPage(page, '/admin/orders/' + o.id);
    await expect(page.getByTestId('admin-order-status')).toContainText('Placed');
    await expect(page.getByTestId('admin-order-advance')).toContainText('Move to Confirmed');
    await expect(page.getByTestId('admin-order-customer')).toContainText(c.email);
    for (const [next, after, count] of [['Confirmed', 'Shipped', 2], ['Shipped', 'Delivered', 3]]) {
      await page.getByTestId('admin-order-advance').click();
      await expect(page.getByTestId('admin-order-status')).toContainText(next);
      await expect(page.getByTestId('admin-order-history-item')).toHaveCount(count);
      await expect(page.getByTestId('admin-order-advance')).toContainText('Move to ' + after);
    }
    await page.getByTestId('admin-order-advance').click();
    await expect(page.getByTestId('admin-order-status')).toContainText('Delivered');
    await expect(page.getByTestId('admin-order-history-item')).toHaveCount(4);
    await expect(page.getByTestId('admin-order-advance')).toHaveCount(0);
    await expect(page.getByTestId('admin-order-cancel')).toHaveCount(0);
    const mine = await h.myOrders(c.token);
    expect(mine.items[0].status).toBe('Delivered');
  });

  test('TC-277 the admin cancels a Shipped order after confirming: stock is returned and the customer sees Cancelled', async ({ page }) => {
    const p = await h.createProduct({ price: 600, stock: 10 });
    const c = await h.customerWithAddress();
    const o = await h.placeOrder(c, [[p, 2]]);
    await h.setStatus(o.id, 'Confirmed');
    await h.setStatus(o.id, 'Shipped');
    expect((await h.getProduct(p.id)).stock).toBe(8);
    await adminPage(page, '/admin/orders/' + o.id);
    await page.getByTestId('admin-order-cancel').click();
    await expect(page.getByTestId('confirm-dialog')).toBeVisible();
    await page.getByTestId('confirm-dialog-cancel').click();
    await expect(page.getByTestId('admin-order-status')).toContainText('Shipped');
    await page.getByTestId('admin-order-cancel').click();
    await page.getByTestId('confirm-dialog-confirm').click();
    await expect(page.getByTestId('admin-order-status')).toContainText('Cancelled');
    await expect(page.getByTestId('admin-order-advance')).toHaveCount(0);
    await expect(page.getByTestId('admin-order-cancel')).toHaveCount(0);
    expect((await h.getProduct(p.id)).stock).toBe(10);
    expect((await h.myOrders(c.token)).items[0].status).toBe('Cancelled');
  });

  test('TC-278 admin order list shows "N orders", paginates 10 per page and returns to page 1 when the filter changes', async ({ page }) => {
    const p = await h.createProduct({ price: 600, stock: 100 });
    const c = await h.customerWithAddress();
    const tok = await h.adminToken();
    let placed = (await h.api('GET', '/admin/orders?status=Placed', { token: tok })).body.total;
    while (placed < 11) { await h.placeOrder(c, [[p, 1]]); placed += 1; }
    const total = (await h.api('GET', '/admin/orders', { token: tok })).body.total;
    await adminPage(page, '/admin/orders');
    await expect(page.getByTestId('admin-orders-total')).toContainText(`${total} orders`);
    await expect(page.getByTestId('admin-orders-item')).toHaveCount(10);
    await expect(page.getByTestId('admin-orders-pagination')).toBeVisible();
    await expect(page.getByTestId('admin-orders-pagination-prev')).toBeDisabled();
    await page.getByTestId('admin-orders-filter').selectOption('Placed');
    await expect(page.getByTestId('admin-orders-total')).toContainText(`${placed} orders`);
    await page.getByTestId('admin-orders-pagination-next').click();
    await expect(page.getByTestId('admin-orders-pagination-prev')).toBeEnabled();
    await page.getByTestId('admin-orders-filter').selectOption('All');
    await expect(page.getByTestId('admin-orders-total')).toContainText(`${total} orders`);
    await expect(page.getByTestId('admin-orders-pagination-prev')).toBeDisabled();
    await expect(page.getByTestId('admin-orders-item')).toHaveCount(10);
    const few = await h.api('GET', '/admin/orders?status=Delivered', { token: tok });
    if (few.body.total <= 10) {
      await page.getByTestId('admin-orders-filter').selectOption('Delivered');
      await expect(page.getByTestId('admin-orders-total')).toContainText(`${few.body.total} order`);
      await expect(page.getByTestId('admin-orders-pagination')).toHaveCount(0);
    }
  });
});
