# ShopEase

ShopEase is a full-stack e-commerce web application for a single online store (prices in INR). Customers can browse and search a product catalogue, keep a cart as a guest or logged-in user, check out with Cash on Delivery or a mock online payment, and track or cancel orders. Admins manage products, categories and orders from a dashboard.

## Features

- Sign up with email verification, log in (JWT), profile, password change, multiple delivery addresses with a default
- Email verification: sign-up creates an unverified account and emails a single-use link (token stored hashed, valid 24 hours); unverified customers cannot log in; "Resend verification email" is limited to 3 per hour per address (429 with Retry-After); sign-up with disposable email domains (e.g. mailinator.com) is blocked. Note: sign-up no longer returns a token or logs the user in; the user verifies by email and then logs in. Seeded users and admins are unaffected.
- Product catalogue: featured products, categories, search, price and category filters, sorting, pagination (12 per page)
- Guest cart in the browser, merged into the server cart on login; stock-aware cart with automatic corrections and notices
- Checkout: address, review, payment (COD or mock online payment), re-check of price and stock before the order is placed
- Order history, order details, customer cancellation (stock is returned exactly once)
- Admin: dashboard, product CRUD, category CRUD, order list and status updates with transition rules
- Security: bcrypt password hashing, role-based access, per-user data scoping, input validation (zod), helmet, CORS, login rate limiting (FR-033)

## Tech stack

- Frontend: React 19, Vite, Tailwind CSS v4, react-router-dom v7
- Backend: Node.js, Express 4, Mongoose
- Database: MongoDB 7 (Docker)
- Tests: Jest (API) and Playwright (end-to-end)
- AI service: not part of this project

## Prerequisites

- Node.js 20 or newer and npm
- Docker Desktop (for MongoDB)
- Git

## Setup

```bash
# 1. Start MongoDB (port 27017)
docker compose up -d

# 2. Backend
cd backend
cp .env.example .env        # review values, set your own JWT_SECRET
npm install
npm run seed                # resets and loads demo data

# 3. Frontend
cd ../frontend
cp .env.example .env
npm install
```

## Run

| Part | Command | URL |
|---|---|---|
| MongoDB | `docker compose up -d` (from the project root) | `mongodb://localhost:27017` |
| Backend | `cd backend && npm run dev` (or `npm start`) | http://localhost:5000 (health: `/health`) |
| Frontend | `cd frontend && npm run dev` | http://localhost:5173 |

`npm run build` in `frontend/` creates a production build in `dist/`.

## Environment variables

Each part ships a `.env.example`. Copy it to `.env` (git-ignored) and adjust.

- `backend/.env.example`: email settings `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`, `APP_URL` (all empty by default; with no `SMTP_HOST` emails are only logged, not sent; `APP_URL` is the frontend URL used in the link, default `http://localhost:5173`), `PORT`, `MONGODB_URI`, `JWT_SECRET`, `CORS_ORIGIN`, login rate-limit settings (`LOGIN_RATE_LIMIT_WINDOW_MS`, `LOGIN_RATE_LIMIT_MAX`), `TRUST_PROXY`, `GLOBAL_RATE_LIMIT_MAX`
- `frontend/.env.example`: `VITE_API_URL` (default `http://localhost:5000/api`)
- `tests/.env.example`: test settings
- Tests: `E2E_API_PORT` and `E2E_WEB_PORT` set the ports the E2E run uses for its own backend and frontend (defaults 5000 and 5173)

### Test-mode email capture

When `NODE_ENV=test` no email is sent; messages are kept in memory. `GET /api/test/emails?to=<email>` returns `items[]` with `link` and `token`; `DELETE /api/test/emails` clears them and resets resend counters. In any other environment both endpoints return 404.

## Seed credentials (development only)

Created by `npm run seed`. Do not use these anywhere outside local development.

| Role | Email | Password |
|---|---|---|
| Admin | admin@shopease.com | Admin@123 |
| Customer | asha@example.com | Shop1234 |
| Customer | ravi@example.com | Shop1234 |

Seed data: 5 categories, 30 products, 6 orders in various statuses.

## Tests

```bash
cd tests
npm install
npx playwright install chromium
npm run test:api
npm run test:e2e
```

The tests start their own backend (in-memory MongoDB) and frontend, so ports 5000 and 5173 must be free (or set `E2E_API_PORT` / `E2E_WEB_PORT`).

Final result: 340 of 340 tests passing (100%), 0 P0 failures (after ONC-001, run 4; the original release was 285/285).

## Project structure

```
ShopEase/
  docker-compose.yml     MongoDB 7
  backend/               Express API (src/app.js, src/server.js, src/seed.js, routes, models, middleware)
  frontend/              React + Vite app (src/pages, components, context, api)
  tests/                 api/ (Jest), e2e/ (Playwright), support/
```

## Known limitations

- Login rate-limit counters are in memory: they reset on restart and are not shared across instances.
- No MongoDB transactions (standalone Mongo): order placement uses compensating stock rollback, so a crash mid-order could leave stock reduced.
- The online payment is a mock page; no real payment provider is integrated.
- Admin product list supports name search only (no category or status filters).
- Sign-up is not rate limited.
- Resend-verification counters are in memory (reset on restart). The disposable-domain list is a static list of about 80 domains, not exhaustive.
- Real SMTP delivery was not tested (no credentials); emails are verified through test-mode capture.
- Seed order dates are relative to when the seed runs; re-run `npm run seed` to reset data.

## Changelog

- ONC-001 — 2026-10-18: Added email verification (hashed single-use 24h token, verification page, login blocked until verified), resend limit of 3 per hour, disposable-domain block, Nodemailer/SMTP config, test-mode email capture. Sign-up no longer logs the user in. Tests: 340/340 passing.
