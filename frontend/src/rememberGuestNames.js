// Runs before the app bundle loads. Guest cart lines only store productId + quantity, so remember the product names
// locally as early as possible; a product that is deleted later can then still be named in the
// "<name> is no longer available" notice (the server has no record of it any more).
const KEY = 'shopease_guest_cart'
const BASE = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/$/, '')

function read() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

try {
  const local = read().filter((i) => i && typeof i.productId === 'string' && Number.isInteger(i.quantity) && i.quantity >= 1)
  if (!localStorage.getItem('shopease_token') && local.some((i) => !i.name)) {
    fetch(`${BASE}/cart/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ items: local.map((i) => ({ productId: i.productId, quantity: i.quantity })) }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((v) => {
        if (!v) return
        const names = new Map(v.items.map((i) => [i.productId, i.name]))
        const current = read()
        if (!current.some((i) => i && !i.name && names.has(i.productId))) return
        localStorage.setItem(
          KEY,
          JSON.stringify(current.map((i) => (!i || i.name || !names.has(i.productId) ? i : { ...i, name: names.get(i.productId) }))),
        )
      })
      .catch(() => {})
  }
} catch { /* ignore */ }
