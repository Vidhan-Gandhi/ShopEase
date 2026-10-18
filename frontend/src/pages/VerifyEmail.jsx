import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { authApi } from '../api'
import { Loading } from '../components/ui'
import { useTitle } from '../utils/hooks'

export default function VerifyEmail() {
  useTitle('Verify email')
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const [state, setState] = useState(token ? 'loading' : 'error') // loading | success | error
  const [message, setMessage] = useState(token ? '' : 'This verification link is invalid or has expired')
  const started = useRef(false)

  useEffect(() => {
    // The token is single use: guard against a second call (React StrictMode runs effects twice in dev).
    if (!token || started.current) return
    started.current = true
    authApi
      .verifyEmail({ token })
      .then(() => setState('success'))
      .catch((err) => {
        setMessage(err.message)
        setState('error')
      })
  }, [token])

  if (state === 'loading') return <Loading testid="verify-loading" label="Verifying your email..." />

  return (
    <div className="mx-auto max-w-md">
      {state === 'success' ? (
        <div data-testid="verify-success" className="card space-y-4 text-center">
          <h1 data-testid="verify-success-title">Email verified</h1>
          <p>Your email has been verified. You can now log in to ShopEase.</p>
          <Link to="/login" data-testid="verify-login-button" className="btn btn-primary">Log in</Link>
        </div>
      ) : (
        <div data-testid="verify-error" role="alert" className="card space-y-4 text-center">
          <h1>Verification failed</h1>
          <p data-testid="verify-error-message">{message}</p>
          <p className="text-sm">Log in with your email and password to request a new verification email.</p>
          <Link to="/login" data-testid="verify-error-login-link" className="btn btn-secondary">Go to log in</Link>
        </div>
      )}
    </div>
  )
}
