import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Field, FormError } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useTitle } from '../utils/hooks'
import { hasErrors, vEmail, vName, vNewPassword } from '../utils/validators'
import { destinationAfterAuth } from './Login'

export default function Signup() {
  useTitle('Sign up')
  const { user, signup } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from
  const [values, setValues] = useState({ name: '', email: '', password: '' })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)

  if (user && !busy) return <Navigate to={destinationAfterAuth(user, from)} replace />
  const set = (k) => (e) => setValues((v) => ({ ...v, [k]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setFormError('')
    const errs = { name: vName(values.name), email: vEmail(values.email), password: vNewPassword(values.password) }
    setErrors(errs)
    if (hasErrors(errs)) return
    setBusy(true)
    try {
      const u = await signup(values.name.trim(), values.email.trim(), values.password)
      navigate(destinationAfterAuth(u, from), { replace: true })
    } catch (err) {
      setBusy(false)
      const f = err.fields
      if (Object.keys(f).length) setErrors(f)
      else setFormError(err.message)
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <h1>Create your account</h1>
      <form data-testid="signup-form" onSubmit={submit} noValidate className="card mt-4 space-y-4">
        <FormError message={formError} testid="signup-error" />
        <Field id="signup-name" testid="signup-name" label="Name" value={values.name} onChange={set('name')} error={errors.name} autoComplete="name" />
        <Field id="signup-email" testid="signup-email" type="email" label="Email" value={values.email} onChange={set('email')} error={errors.email} autoComplete="email" />
        <Field
          id="signup-password" testid="signup-password" type="password" label="Password"
          value={values.password} onChange={set('password')} error={errors.password} autoComplete="new-password"
          hint="At least 8 characters with a letter and a number."
        />
        <button type="submit" data-testid="signup-submit" className="btn btn-primary w-full" disabled={busy}>
          {busy ? 'Creating account...' : 'Sign up'}
        </button>
      </form>
      <p className="mt-4 text-sm">
        Already have an account?{' '}
        <Link to="/login" state={location.state} data-testid="signup-login-link" className="link">Log in</Link>
      </p>
    </div>
  )
}
