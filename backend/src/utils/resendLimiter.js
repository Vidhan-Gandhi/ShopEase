// ONC-001: max 3 verification-email resends per hour per email (in memory). Keyed by email whether or not the
// account exists, so the response never reveals which emails are registered.
const store = new Map(); // email -> { count, resetAt }
const MAX = 3;
const WINDOW_MS = 60 * 60 * 1000;

/** Returns 0 and counts the attempt if allowed, otherwise the seconds until the window resets. */
function consume(email) {
  const key = String(email).trim().toLowerCase();
  const now = Date.now();
  if (store.size > 5000) for (const [k, v] of store) if (v.resetAt <= now) store.delete(k);
  let e = store.get(key);
  if (!e || e.resetAt <= now) {
    e = { count: 0, resetAt: now + WINDOW_MS };
    store.set(key, e);
  }
  if (e.count >= MAX) return Math.max(1, Math.ceil((e.resetAt - now) / 1000));
  e.count += 1;
  return 0;
}

function reset() {
  store.clear();
}

module.exports = { consume, reset, MAX, WINDOW_MS };
