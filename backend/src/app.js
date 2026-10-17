const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { parseTrustProxy } = require('./config');

const app = express();

app.disable('x-powered-by');
// TRUST_PROXY=true makes req.ip use X-Forwarded-For (needed for per-IP login limiting behind a proxy / in tests).
app.set('trust proxy', parseTrustProxy(process.env.TRUST_PROXY));

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

// General API limiter (generous; the strict login limiter lives in utils/loginRateLimiter.js)
app.use(
  '/api',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: Number(process.env.GLOBAL_RATE_LIMIT_MAX) || 1000,
    standardHeaders: true,
    legacyHeaders: false,
    validate: false,
    skip: () => process.env.NODE_ENV === 'test',
    handler: (req, res) => res.status(429).json({ message: 'Too many requests. Please try again later.' }),
  })
);

app.use(express.json({ limit: '100kb' }));

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api', routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
