import { useEffect, useState } from 'react'
import { profileApi } from '../api'
import AccountNav from '../components/AccountNav'
import { ErrorState, Field, FormError, FormSuccess, Loading } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useFetch, useTitle } from '../utils/hooks'
import { hasErrors, vName, vPhone } from '../utils/validators'

export default function Profile() {
  useTitle('My profile')
  const { setUser } = useAuth()
  const { data, loading, error, reload } = useFetch(() => profileApi.get(), [])
  const [values, setValues] = useState({ name: '', phone: '' })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [success, setSuccess] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (data) setValues({ name: data.user.name, phone: data.user.phone || '' })
  }, [data])

  async function submit(e) {
    e.preventDefault()
    setFormError('')
    setSuccess('')
    const errs = { name: vName(values.name), phone: vPhone(values.phone) }
    setErrors(errs)
    if (hasErrors(errs)) return
    setBusy(true)
    try {
      const res = await profileApi.update({ name: values.name.trim(), phone: values.phone.trim() })
      setUser(res.user)
      setValues({ name: res.user.name, phone: res.user.phone || '' })
      setSuccess('Profile updated successfully')
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
      <h1 data-testid="profile-title">My profile</h1>
      <div className="mt-4"><AccountNav /></div>
      {loading && <Loading testid="profile-loading" />}
      {error && <ErrorState testid="profile-error" error={error} onRetry={reload} />}
      {data && (
        <form data-testid="profile-form" onSubmit={submit} noValidate className="card space-y-4">
          <FormError message={formError} testid="profile-form-error" />
          <FormSuccess message={success} testid="profile-success" />
          <Field id="profile-name" testid="profile-name" label="Name" value={values.name} onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))} error={errors.name} autoComplete="name" />
          <Field id="profile-email" testid="profile-email" label="Email" value={data.user.email} readOnly aria-readonly="true" hint="Email cannot be changed." />
          <Field id="profile-phone" testid="profile-phone" label="Phone (optional)" inputMode="numeric" value={values.phone} onChange={(e) => setValues((v) => ({ ...v, phone: e.target.value }))} error={errors.phone} autoComplete="tel-national" />
          <button type="submit" data-testid="profile-submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving...' : 'Save changes'}
          </button>
        </form>
      )}
    </div>
  )
}
