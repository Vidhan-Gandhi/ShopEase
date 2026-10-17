// In-memory failed-login limiter (FR-033). Keys: client IP and normalised email, tracked separately.
const ipStore = new Map(); // key -> { count, resetAt }
const emailStore = new Map();

function config() {
  const windowMs = Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS);
  const max = Number(process.env.LOGIN_RATE_LIMIT_MAX);
  return {
    windowMs: Number.isFinite(windowMs) && windowMs > 0 ? windowMs : 15 * 60 * 1000,
    max: Number.isFinite(max) && max > 0 ? max : 5,
  };
}

function active(store, key, now) {
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.resetAt <= now) {
    store.delete(key);
    return null;
  }
  return entry;
}

function sweep(store, now) {
  if (store.size < 5000) return;
  for (const [k, v] of store) if (v.resetAt <= now) store.delete(k);
}

const normEmail = (email) => String(email).trim().toLowerCase();

/** Returns remaining seconds (>= 1) if the request must be blocked, otherwise 0. */
function getRetryAfter(ip, email) {
  const now = Date.now();
  const { max } = config();
  let retryMs = 0;
  const ipEntry = active(ipStore, ip, now);
  if (ipEntry && ipEntry.count >= max) retryMs = Math.max(retryMs, ipEntry.resetAt - now);
  const emailEntry = active(emailStore, normEmail(email), now);
  if (emailEntry && emailEntry.count >= max) retryMs = Math.max(retryMs, emailEntry.resetAt - now);
  return retryMs > 0 ? Math.max(1, Math.ceil(retryMs / 1000)) : 0;
}

function bump(store, key, now, windowMs) {
  let entry = active(store, key, now);
  if (!entry) {
    entry = { count: 0, resetAt: now + windowMs };
    store.set(key, entry);
  }
  entry.count += 1;
}

function recordFailure(ip, email) {
  const now = Date.now();
  const { windowMs } = config();
  sweep(ipStore, now);
  sweep(emailStore, now);
  bump(ipStore, ip, now, windowMs);
  bump(emailStore, normEmail(email), now, windowMs);
}

function resetEmail(email) {
  emailStore.delete(normEmail(email));
}

function reset() {
  ipStore.clear();
  emailStore.clear();
}

module.exports = { getRetryAfter, recordFailure, resetEmail, reset };
