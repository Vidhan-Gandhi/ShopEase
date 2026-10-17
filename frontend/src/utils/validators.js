export const PASSWORD_RULE = 'Password must be at least 8 characters and contain a letter and a number'

export function vName(v) {
  const s = (v || '').trim()
  if (!s) return 'Name is required'
  if (s.length < 2) return 'Name must be at least 2 characters'
  if (s.length > 50) return 'Name must be at most 50 characters'
  return ''
}
export function vEmail(v) {
  const s = (v || '').trim()
  if (!s) return 'Email is required'
  if (s.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return 'Enter a valid email'
  return ''
}
export function vNewPassword(v) {
  const s = v || ''
  if (s.length < 8 || s.length > 72 || !/[A-Za-z]/.test(s) || !/\d/.test(s)) return PASSWORD_RULE
  return ''
}
export function vPhone(v, required = false) {
  const s = (v || '').trim()
  if (!s) return required ? 'Enter a valid 10-digit mobile number' : ''
  return /^[6-9]\d{9}$/.test(s) ? '' : 'Enter a valid 10-digit mobile number'
}
export function vPincode(v) {
  return /^[1-9]\d{5}$/.test((v || '').trim()) ? '' : 'Enter a valid 6-digit pincode'
}
export function vRange(v, label, min, max) {
  const s = (v || '').trim()
  if (!s) return `${label} is required`
  if (s.length < min) return `${label} must be at least ${min} characters`
  if (s.length > max) return `${label} must be at most ${max} characters`
  return ''
}
export function vQuantity(s) {
  return /^[1-9]\d*$/.test(String(s).trim()) && Number(s) <= 100000
    ? ''
    : 'Quantity must be a whole number of at least 1'
}
/** Money-like text: returns {error} or {value}. */
export function parseMoney(s, label, { required = true, max = 10000000 } = {}) {
  const t = String(s ?? '').trim()
  if (!t) return required ? { error: `${label} is required` } : { value: null }
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return { error: `${label} must be a number with at most 2 decimals` }
  const n = Number(t)
  if (n <= 0) return { error: `${label} must be greater than 0` }
  if (n > max) return { error: `${label} is too large` }
  return { value: n }
}
export function hasErrors(obj) {
  return Object.values(obj).some(Boolean)
}
