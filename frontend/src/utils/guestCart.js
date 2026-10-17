const KEY = 'shopease_guest_cart'

export function readGuestCart() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]')
    if (!Array.isArray(v)) return []
    return v.filter((i) => i && typeof i.productId === 'string' && Number.isInteger(i.quantity) && i.quantity >= 1)
  } catch {
    return []
  }
}
export function writeGuestCart(items) {
  try {
    if (items.length) localStorage.setItem(KEY, JSON.stringify(items))
    else localStorage.removeItem(KEY)
  } catch { /* ignore */ }
}
export function clearGuestCart() { writeGuestCart([]) }
