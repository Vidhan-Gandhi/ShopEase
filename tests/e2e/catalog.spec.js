const h = require('./helpers');
const { test, expect } = h;

const SEEDED = ['Electronics', 'Fashion', 'Books', 'Home & Kitchen', 'Sports & Fitness'];
const card = (page, name) => page.getByTestId('products-item').filter({ hasText: name });

async function applySearch(page, q) {
  await page.getByTestId('products-search').fill(q);
  await page.getByTestId('products-apply').click();
}

test.describe('FR-007 home page', () => {
  test('TC-221 home shows max 8 featured products and all categories; clicking a category opens the filtered listing', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('home-item').first()).toBeVisible();
    expect(await page.getByTestId('home-item').count()).toBe(8);
    const names = await page.getByTestId('home-category-name').allInnerTexts();
    for (const n of SEEDED) expect(names.map((x) => x.trim())).toContain(n);
    await page.getByTestId('home-category').filter({ hasText: 'Books' }).getByTestId('home-category-link').click();
    await expect(page).toHaveURL(/\/products\?.*category=/);
    await expect(page.getByTestId('products-item').first()).toBeVisible();
    const selected = await page.getByTestId('products-category').evaluate((el) => el.options[el.selectedIndex].text);
    expect(selected.trim()).toBe('Books');
    const cats = await page.getByTestId('products-item-category').allInnerTexts();
    expect(cats.length).toBeGreaterThan(0);
    cats.forEach((c) => expect(c.trim()).toBe('Books'));
  });

  test('TC-222 when the API is unreachable home shows an error message with a Retry button that recovers', async ({ page }) => {
    await page.route('**/api/products/featured', (r) => r.abort());
    await page.route('**/api/categories', (r) => r.abort());
    await page.goto('/');
    await expect(page.getByTestId('home-error')).toBeVisible();
    await expect(page.getByTestId('home-error-retry')).toBeVisible();
    await page.unroute('**/api/products/featured');
    await page.unroute('**/api/categories');
    await page.getByTestId('home-error-retry').click();
    await expect(page.getByTestId('home-item').first()).toBeVisible();
    await expect(page.getByTestId('home-error')).toHaveCount(0);
  });

  test('TC-223 with no featured products home shows "No featured products yet" and still loads categories', async ({ page }) => {
    await page.route('**/api/products/featured', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) }));
    await page.goto('/');
    await expect(page.getByTestId('home-featured-empty')).toContainText('No featured products yet');
    await expect(page.getByTestId('home-category').first()).toBeVisible();
  });

  test('TC-224 a loading indicator is visible while home data is pending', async ({ page }) => {
    await page.route('**/api/products/featured', async (r) => {
      await new Promise((res) => setTimeout(res, 2000));
      await r.continue();
    });
    await page.goto('/');
    await expect(page.getByTestId('home-loading')).toBeVisible();
    await expect(page.getByTestId('home-item').first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('home-loading')).toHaveCount(0);
  });
});

test.describe('FR-008..FR-011 listing', () => {
  test('TC-225 search "shirt" shows Cotton T-Shirt, puts q in the URL and survives a reload', async ({ page }) => {
    await page.goto('/products');
    await applySearch(page, 'shirt');
    await expect(card(page, 'Cotton T-Shirt')).toBeVisible();
    await expect(page).toHaveURL(/q=shirt/);
    await page.reload();
    await expect(page.getByTestId('products-search')).toHaveValue('shirt');
    await expect(card(page, 'Cotton T-Shirt')).toBeVisible();
    await applySearch(page, 'SHIRT');
    await expect(card(page, 'Cotton T-Shirt')).toBeVisible();
  });

  test('TC-226 a search with no match shows "No products found" with a Clear filters action that restores the list', async ({ page }) => {
    await page.goto('/products?q=zzzz');
    await expect(page.getByTestId('products-empty')).toContainText('No products found');
    await page.getByTestId('products-empty-clear').click();
    await expect(page.getByTestId('products-item').first()).toBeVisible();
    await expect(page.getByTestId('products-search')).toHaveValue('');
    await expect(page).not.toHaveURL(/q=zzzz/);
  });

  test('TC-227 min price 500 and max 100 shows "Minimum price cannot be more than maximum price" and does not apply the filter', async ({ page }) => {
    const requests = [];
    page.on('request', (r) => requests.push(r.url()));
    await page.goto('/products');
    await expect(page.getByTestId('products-item').first()).toBeVisible();
    await page.getByTestId('products-min-price').fill('500');
    await page.getByTestId('products-max-price').fill('100');
    await page.getByTestId('products-apply').click();
    await expect(page.getByTestId('products-price-error')).toContainText('Minimum price cannot be more than maximum price');
    expect(requests.some((u) => u.includes('/api/products') && u.includes('minPrice=500'))).toBe(false);
    await expect(page).not.toHaveURL(/minPrice=500/);
  });

  test('TC-228 category filter limits the list; "Clear filters" removes filters and search', async ({ page }) => {
    await page.goto('/products');
    await page.getByTestId('products-category').selectOption({ label: 'Books' });
    await page.getByTestId('products-search').fill('novel');
    await page.getByTestId('products-apply').click();
    await expect(page.getByTestId('products-item').first()).toBeVisible();
    const cats = await page.getByTestId('products-item-category').allInnerTexts();
    const names = await page.getByTestId('products-item-name').allInnerTexts();
    expect(cats.length).toBeGreaterThan(0);
    cats.forEach((c) => expect(c.trim()).toBe('Books'));
    names.forEach((n) => expect(n.toLowerCase()).toContain('novel'));
    await page.getByTestId('products-clear').click();
    await expect(page.getByTestId('products-search')).toHaveValue('');
    await expect(page).not.toHaveURL(/category=|q=novel/);
    await expect(page.getByTestId('products-item')).toHaveCount(12);
  });

  test('TC-229 sorting by "Price: low to high" lists effective prices in ascending order', async ({ page }) => {
    await page.goto('/products');
    await expect(page.getByTestId('products-item').first()).toBeVisible();
    await page.getByTestId('products-sort').selectOption('price_asc');
    await expect(page).toHaveURL(/sort=price_asc/);
    await expect(page.getByTestId('products-item').first()).toBeVisible();
    const prices = (await page.getByTestId('products-item-price').allInnerTexts()).map(h.parseMoney);
    expect(prices.length).toBe(12);
    for (let i = 1; i < prices.length; i++) expect(prices[i]).toBeGreaterThanOrEqual(prices[i - 1]);
    await page.getByTestId('products-sort').selectOption('name_asc');
    await expect(page).toHaveURL(/sort=name_asc/);
    await expect(page.getByTestId('products-item').first()).toBeVisible();
    const names = (await page.getByTestId('products-item-name').allInnerTexts()).map((n) => n.trim().toLowerCase());
    expect(names).toEqual([...names].sort());
  });

  test('TC-230 listing shows 12 per page with the total, Previous disabled on page 1, Next works and is disabled on the last page', async ({ page }) => {
    const total = (await h.api('GET', '/products')).body.total;
    const totalPages = Math.ceil(total / 12);
    expect(totalPages).toBeGreaterThanOrEqual(3);
    await page.goto('/products');
    await expect(page.getByTestId('products-item')).toHaveCount(12);
    const totalNow = (await h.api('GET', '/products')).body.total;
    await expect(page.getByTestId('products-total')).toContainText(String(totalNow));
    await expect(page.getByTestId('products-pagination')).toBeVisible();
    await expect(page.getByTestId('products-pagination-prev')).toBeDisabled();
    await page.getByTestId('products-pagination-next').click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByTestId('products-pagination-prev')).toBeEnabled();
    await page.goto('/products?page=' + totalPages);
    await expect(page.getByTestId('products-item').first()).toBeVisible();
    await expect(page.getByTestId('products-pagination-next')).toBeDisabled();
    const lastCount = total - 12 * (totalPages - 1);
    await expect(page.getByTestId('products-item')).toHaveCount(lastCount);
    // changing a filter returns to page 1
    await page.getByTestId('products-sort').selectOption('price_desc');
    await expect(page).not.toHaveURL(/page=[2-9]/);
  });

  test('TC-231 page=999 shows "No products found" with a link back to page 1 (no crash)', async ({ page }) => {
    await page.goto('/products?page=999');
    await expect(page.getByTestId('products-empty')).toContainText('No products found');
    await expect(page.getByTestId('products-first-page')).toBeVisible();
    await page.getByTestId('products-first-page').click();
    await expect(page.getByTestId('products-item').first()).toBeVisible();
  });

  test('TC-232 with 12 or fewer matching products the pagination controls are hidden', async ({ page }) => {
    await page.goto('/products?q=' + encodeURIComponent('Cotton T-Shirt'));
    await expect(card(page, 'Cotton T-Shirt')).toBeVisible();
    await expect(page.getByTestId('products-pagination')).toHaveCount(0);
  });
});

test.describe('FR-012 / FR-013 product details and stock', () => {
  test('TC-233 details page shows the discounted price, the struck-through original price and lets me switch between 3 images', async ({ page }) => {
    const imgs = [`${h.IMG}?i=1`, `${h.IMG}?i=2`, `${h.IMG}?i=3`];
    const p = await h.createProduct({ price: 1000, discountedPrice: 800, images: imgs, stock: 20, name: 'Gallery ' + h.uid() });
    await page.goto('/products/' + p.id);
    await expect(page.getByTestId('product-name')).toContainText(p.name);
    await expect(page.getByTestId('product-price')).toContainText('₹800.00');
    const orig = page.getByTestId('product-original-price');
    await expect(orig).toContainText('₹1,000.00');
    expect(await orig.evaluate((el) => getComputedStyle(el).textDecorationLine)).toContain('line-through');
    await expect(page.getByTestId('product-thumb')).toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      await page.getByTestId('product-thumb').nth(i).click();
      await expect(page.getByTestId('product-main-image')).toHaveAttribute('src', imgs[i]);
    }
    await expect(page.getByTestId('product-category')).toBeVisible();
    await expect(page.getByTestId('product-description')).toContainText('E2E product');
  });

  test('TC-234 stock text: 6 "In stock", 5 "Only 5 left", 1 "Only 1 left"; no discount means only the regular price is shown', async ({ page }) => {
    const expected = [[6, 'In stock'], [5, 'Only 5 left'], [1, 'Only 1 left']];
    for (const [stock, text] of expected) {
      const p = await h.createProduct({ stock, price: 349 });
      await page.goto('/products/' + p.id);
      await expect(page.getByTestId('product-stock')).toContainText(text);
      if (stock === 6) expect(await page.getByTestId('product-stock').innerText()).not.toContain('Only');
      await expect(page.getByTestId('product-price')).toContainText('₹349.00');
      await expect(page.getByTestId('product-original-price')).toHaveCount(0);
    }
  });

  test('TC-235 an unknown or malformed product id shows "Product not found" with a link to the listing', async ({ page }) => {
    for (const id of ['507f1f77bcf86cd799439011', 'abc']) {
      await page.goto('/products/' + id);
      await expect(page.getByTestId('product-not-found')).toContainText('Product not found');
      await expect(page.getByTestId('product-back-to-listing')).toBeVisible();
    }
    await page.getByTestId('product-back-to-listing').click();
    await expect(page).toHaveURL(/\/products$/);
  });

  test('TC-236 an image URL that fails to load is replaced by a placeholder (no broken image)', async ({ page }) => {
    const broken = 'http://localhost:9/does-not-exist.png';
    const p = await h.createProduct({ images: [broken], stock: 10 });
    await page.goto('/products/' + p.id);
    const img = page.getByTestId('product-main-image');
    await expect(img).toBeVisible();
    await expect.poll(async () => img.getAttribute('src'), { timeout: 15000 }).not.toBe(broken);
    await expect.poll(async () => img.evaluate((el) => el.complete && el.naturalWidth > 0), { timeout: 15000 }).toBe(true);
  });

  test('TC-237 an out-of-stock product shows an "Out of stock" label and a disabled add-to-cart button in the listing and on its page', async ({ page }) => {
    const p = await h.createProduct({ stock: 0, name: 'Sold Out ' + h.uid() });
    await page.goto('/products?q=' + encodeURIComponent(p.name));
    const c = card(page, p.name);
    await expect(c).toBeVisible();
    await expect(c.getByTestId('products-item-stock')).toContainText('Out of stock');
    await expect(c.getByTestId('products-item-add')).toBeDisabled();
    await page.goto('/products/' + p.id);
    await expect(page.getByTestId('product-stock')).toContainText('Out of stock');
    await expect(page.getByTestId('product-add-to-cart')).toBeDisabled();
  });
});
