# ShopEase

ShopEase is a full-stack e-commerce web application for a single online store (prices in INR). Customers can browse and search a product catalogue, keep a cart as a guest or logged-in user, check out with Cash on Delivery or a mock online payment, and track or cancel orders. Admins manage products, categories and orders from a dashboard.

## Features

- Sign up, log in (JWT), profile, password change, multiple delivery addresses with a default
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

- `backend/.env.example`: `PORT`, `MONGODB_URI`, `JWT_SECRET`, `CORS_ORIGIN`, login rate-limit settings (`LOGIN_RATE_LIMIT_WINDOW_MS`, `LOGIN_RATE_LIMIT_MAX`), `TRUST_PROXY`, `GLOBAL_RATE_LIMIT_MAX`
- `frontend/.env.example`: `VITE_API_URL` (default `http://localhost:5000/api`)
- `tests/.env.example`: test settings

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

The tests start their own backend (in-memory MongoDB) and frontend, so ports 5000 and 5173 must be free.

Final result: 285 of 285 tests passing (100%), 0 P0 failures (run 2 after one fix round; run 1 was 283/285).

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
- Seed order dates are relative to when the seed runs; re-run `npm run seed` to reset data.
