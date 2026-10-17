const money = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatMoney(n) {
  const v = Number(n)
  return money.format(Number.isFinite(v) ? Math.round(v * 100) / 100 : 0)
}

export function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDateOnly(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' })
}

export function retryText(seconds) {
  if (!seconds || seconds < 1) return ''
  if (seconds < 60) return ` Try again in ${seconds} second${seconds === 1 ? '' : 's'}.`
  const m = Math.ceil(seconds / 60)
  return ` Try again in about ${m} minute${m === 1 ? '' : 's'}.`
}
