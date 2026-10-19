# ShopEase screenshots

Documentation screenshots of the running app, captured automatically with Playwright at desktop (1280x800) and mobile (375x812), full page. They are not part of the test suite.

Contents: [Home](#home) | [Product list](#product-list) | [Product page](#product-page) | [Cart](#cart) | [Checkout](#checkout) | [Order confirmation](#order-confirmation) | [Admin dashboard](#admin-dashboard)

## Home

### featured products and categories

- Role: guest
- Route: `/`
- FRs shown: FR-007, FR-013, NFR-001, NFR-006

| Desktop | Mobile |
|---|---|
| [![01-guest-home desktop](screenshots/01-guest-home-desktop.png)](screenshots/01-guest-home-desktop.png) | [![01-guest-home mobile](screenshots/01-guest-home-mobile.png)](screenshots/01-guest-home-mobile.png) |

## Product list

### page 1 of results with filters, sort and pagination

- Role: guest
- Route: `/products`
- FRs shown: FR-008, FR-009, FR-010, FR-011, FR-013, NFR-006

| Desktop | Mobile |
|---|---|
| [![02-guest-products desktop](screenshots/02-guest-products-desktop.png)](screenshots/02-guest-products-desktop.png) | [![02-guest-products mobile](screenshots/02-guest-products-mobile.png)](screenshots/02-guest-products-mobile.png) |

## Product page

### in-stock product "Atomic Habits"

- Role: guest
- Route: `/products/:id`
- FRs shown: FR-012, FR-013, FR-014, NFR-006

| Desktop | Mobile |
|---|---|
| [![03-guest-product-detail desktop](screenshots/03-guest-product-detail-desktop.png)](screenshots/03-guest-product-detail-desktop.png) | [![03-guest-product-detail mobile](screenshots/03-guest-product-detail-mobile.png)](screenshots/03-guest-product-detail-mobile.png) |

## Cart

### two items with totals

- Role: customer
- Route: `/cart`
- FRs shown: FR-014, FR-015, FR-017, NFR-006

| Desktop | Mobile |
|---|---|
| [![04-customer-cart desktop](screenshots/04-customer-cart-desktop.png)](screenshots/04-customer-cart-desktop.png) | [![04-customer-cart mobile](screenshots/04-customer-cart-mobile.png)](screenshots/04-customer-cart-mobile.png) |

## Checkout

### mock online payment page

- Role: customer
- Route: `/checkout`
- FRs shown: FR-019

| Desktop | Mobile |
|---|---|
| [![05-customer-checkout-mock-payment desktop](screenshots/05-customer-checkout-mock-payment-desktop.png)](screenshots/05-customer-checkout-mock-payment-desktop.png) | [![05-customer-checkout-mock-payment mobile](screenshots/05-customer-checkout-mock-payment-mobile.png)](screenshots/05-customer-checkout-mock-payment-mobile.png) |

### step 1 - choose delivery address

- Role: customer
- Route: `/checkout`
- FRs shown: FR-018, FR-004

| Desktop | Mobile |
|---|---|
| [![05-customer-checkout-step1-address desktop](screenshots/05-customer-checkout-step1-address-desktop.png)](screenshots/05-customer-checkout-step1-address-desktop.png) | [![05-customer-checkout-step1-address mobile](screenshots/05-customer-checkout-step1-address-mobile.png)](screenshots/05-customer-checkout-step1-address-mobile.png) |

### step 2 - review order

- Role: customer
- Route: `/checkout`
- FRs shown: FR-018, FR-015

| Desktop | Mobile |
|---|---|
| [![05-customer-checkout-step2-review desktop](screenshots/05-customer-checkout-step2-review-desktop.png)](screenshots/05-customer-checkout-step2-review-desktop.png) | [![05-customer-checkout-step2-review mobile](screenshots/05-customer-checkout-step2-review-mobile.png)](screenshots/05-customer-checkout-step2-review-mobile.png) |

### step 3 - payment method not yet chosen (Place order disabled)

- Role: customer
- Route: `/checkout`
- FRs shown: FR-019

| Desktop | Mobile |
|---|---|
| [![05-customer-checkout-step3-payment desktop](screenshots/05-customer-checkout-step3-payment-desktop.png)](screenshots/05-customer-checkout-step3-payment-desktop.png) | [![05-customer-checkout-step3-payment mobile](screenshots/05-customer-checkout-step3-payment-mobile.png)](screenshots/05-customer-checkout-step3-payment-mobile.png) |

### step 3 - Online payment selected

- Role: customer
- Route: `/checkout`
- FRs shown: FR-019

| Desktop | Mobile |
|---|---|
| [![05-customer-checkout-step3-payment-online desktop](screenshots/05-customer-checkout-step3-payment-online-desktop.png)](screenshots/05-customer-checkout-step3-payment-online-desktop.png) | [![05-customer-checkout-step3-payment-online mobile](screenshots/05-customer-checkout-step3-payment-online-mobile.png)](screenshots/05-customer-checkout-step3-payment-online-mobile.png) |

## Order confirmation

### order placed (online payment, simulated)

- Role: customer
- Route: `/order-confirmation/:id`
- FRs shown: FR-020, FR-019, FR-024, NFR-006

| Desktop | Mobile |
|---|---|
| [![06-customer-order-confirmation desktop](screenshots/06-customer-order-confirmation-desktop.png)](screenshots/06-customer-order-confirmation-desktop.png) | [![06-customer-order-confirmation mobile](screenshots/06-customer-order-confirmation-mobile.png)](screenshots/06-customer-order-confirmation-mobile.png) |

## Admin dashboard

### totals, low stock, recent orders

- Role: admin
- Route: `/admin`
- FRs shown: FR-025, FR-006, NFR-006

| Desktop | Mobile |
|---|---|
| [![07-admin-dashboard desktop](screenshots/07-admin-dashboard-desktop.png)](screenshots/07-admin-dashboard-desktop.png) | [![07-admin-dashboard mobile](screenshots/07-admin-dashboard-mobile.png)](screenshots/07-admin-dashboard-mobile.png) |

## Limitations

- Product images come from picsum.photos (seed data), so internet access is required to see them.
- Order numbers, dates and dashboard totals vary per run.
- On mobile, the admin Recent orders table scrolls horizontally by design, so the Total/Status columns are cut off in the image.
- Only the online-payment success path is shown for placing an order; COD, failure and validation states are not captured.

## Re-running

```
cd Output/ShopEase/tests
npx playwright install chromium   # once
npm run screenshots
```
Ports 5000 and 5173 must be free.
