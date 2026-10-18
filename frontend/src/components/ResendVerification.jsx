import { useState } from 'react'
import { authApi } from '../api'
import { retryText } from '../utils/format'
import { FormError, FormSuccess } from './ui'

/** "Resend verification email" button with its own status message (ONC-001). `prefix` keeps data-testids unique per page. */
export default function ResendVerification({ email, prefix }) {
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState('')
  const [error, setError] = useState('')

  async function resend() {
    setBusy(true)
    setDone('')
    setError('')
    try {
      const r = await authApi.resendVerification({ email })
      setDone(r.message)
    } catch (err) {
      setError(err.status === 429 ? err.message + retryText(err.retryAfter) : err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <button type="button" data-testid={`${prefix}-resend`} className="btn btn-secondary" onClick={resend} disabled={busy}>
        {busy ? 'Sending...' : 'Resend verification email'}
      </button>
      <FormSuccess message={done} testid={`${prefix}-resend-success`} />
      <FormError message={error} testid={`${prefix}-resend-error`} />
    </div>
  )
}
