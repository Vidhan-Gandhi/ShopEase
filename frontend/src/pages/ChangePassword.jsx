import { useState } from 'react'
import { profileApi } from '../api'
import AccountNav from '../components/AccountNav'
import { Field, FormError, FormSuccess } from '../components/ui'
import { useTitle } from '../utils/hooks'
import { hasErrors, vNewPassword } from '../utils/validators'

export default function ChangePassword() {
  useTitle('Change password')
  const [values, setValues] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [success, setSuccess] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setValues((v) => ({ ...v, [k]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setFormError('')
    setSuccess('')
    const errs = {
      currentPassword: values.currentPassword ? '' : 'Current password is required',
      newPassword: vNewPassword(values.newPassword),
      confirmPassword: values.confirmPassword === values.newPassword ? '' : 'Passwords do not match',
    }
    setErrors(errs)
    if (hasErrors(errs)) return
    setBusy(true)
    try {
      await profileApi.changePassword({ currentPassword: values.currentPassword, newPassword: values.newPassword })
      setValues({ currentPassword: '', newPassword: '', confirmPassword: '' })
      setSuccess('Password changed successfully')
    } catch (err) {
      const f = err.fields
      if (Object.keys(f).length) setErrors(f)
      else setFormError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 data-testid="password-title">Change password</h1>
      <div className="mt-4"><AccountNav /></div>
      <form data-testid="password-form" onSubmit={submit} noValidate className="card space-y-4">
        <FormError message={formError} testid="password-error" />
        <FormSuccess message={success} testid="password-success" />
        <Field id="password-current" testid="password-current" type="password" label="Current password" value={values.currentPassword} onChange={set('currentPassword')} error={errors.currentPassword} autoComplete="current-password" />
        <Field id="password-new" testid="password-new" type="password" label="New password" value={values.newPassword} onChange={set('newPassword')} error={errors.newPassword} autoComplete="new-password" hint="At least 8 characters with a letter and a number." />
        <Field id="password-confirm" testid="password-confirm" type="password" label="Confirm new password" value={values.confirmPassword} onChange={set('confirmPassword')} error={errors.confirmPassword} autoComplete="new-password" />
        <button type="submit" data-testid="password-submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving...' : 'Change password'}
        </button>
      </form>
    </div>
  )
}
