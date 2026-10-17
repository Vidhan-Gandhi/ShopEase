import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Field, FormError } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { retryText } from '../utils/format'
import { useTitle } from '../utils/hooks'
import { hasErrors, vEmail } from '../utils/validators'

export function destinationAfterAuth(user, from) {
  if (user.role === 'admin') return from && from.startsWith('/admin') ? from : '/admin'
  return from || '/'
}

export default function Login() {
  useTitle('Log in')
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from
  const notice = location.state?.message
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)

  if (user && !busy) return <Navigate to={destinationAfterAuth(user, from)} replace />

  async function submit(e) {
    e.preventDefault()
    setFormError('')
    const errs = { email: vEmail(email), password: password ? '' : 'Password is required' }
    setErrors(errs)
    if (hasErrors(errs)) return
    setBusy(true)
    try {
      const u = await login(email.trim(), password)
      navigate(destinationAfterAuth(u, from), { replace: true })
    } catch (err) {
      setBusy(false)
      const f = err.fields
      if (err.status === 400 && Object.keys(f).length) setErrors(f)
      else if (err.status === 429) setFormError(err.message + retryText(err.retryAfter))
      else setFormError(err.message)
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <h1>Log in</h1>
      {notice && (
        <div data-testid="login-notice" role="status" className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {notice}
        </div>
      )}
      <form data-testid="login-form" onSubmit={submit} noValidate className="card mt-4 space-y-4">
        <FormError message={formError} testid="login-error" />
        <Field id="login-email" testid="login-email" type="email" label="Email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} autoComplete="email" />
        <Field id="login-password" testid="login-password" type="password" label="Password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} autoComplete="current-password" />
        <button type="submit" data-testid="login-submit" className="btn btn-primary w-full" disabled={busy}>
          {busy ? 'Logging in...' : 'Log in'}
        </button>
      </form>
      <p className="mt-4 text-sm">
        New to ShopEase?{' '}
        <Link to="/signup" state={location.state} data-testid="login-signup-link" className="link">Create an account</Link>
      </p>
    </div>
  )
}
