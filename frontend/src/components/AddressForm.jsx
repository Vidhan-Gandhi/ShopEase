import { useState } from 'react'
import { addressApi } from '../api'
import { hasErrors, vPhone, vPincode, vRange } from '../utils/validators'
import { Field, FormError } from './ui'

const EMPTY = { name: '', phone: '', addressLine: '', city: '', state: '', pincode: '', isDefault: false }

function validate(v) {
  return {
    name: vRange(v.name, 'Name', 2, 50),
    phone: vPhone(v.phone, true),
    addressLine: vRange(v.addressLine, 'Address', 5, 150),
    city: vRange(v.city, 'City', 2, 50),
    state: vRange(v.state, 'State', 2, 50),
    pincode: vPincode(v.pincode),
  }
}

/** Add / edit address form. `p` = testid prefix. onSaved(address) after success. */
export default function AddressForm({ address, p = 'address-form', onSaved, onCancel, showDefault = true }) {
  const [values, setValues] = useState(address ? { ...EMPTY, ...address } : EMPTY)
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)

  const set = (k) => (e) => setValues((v) => ({ ...v, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setFormError('')
    const errs = validate(values)
    setErrors(errs)
    if (hasErrors(errs)) return
    setBusy(true)
    const body = {
      name: values.name.trim(),
      phone: values.phone.trim(),
      addressLine: values.addressLine.trim(),
      city: values.city.trim(),
      state: values.state.trim(),
      pincode: values.pincode.trim(),
      isDefault: !!values.isDefault,
    }
    try {
      const res = address ? await addressApi.update(address.id, body) : await addressApi.create(body)
      onSaved(res.address)
    } catch (err) {
      const f = err.fields
      if (Object.keys(f).length) setErrors(f)
      else setFormError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const id = (k) => `${p}-${k}`
  return (
    <form data-testid={p} onSubmit={submit} noValidate className="space-y-3">
      <FormError message={formError} testid={`${p}-error`} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={id('name')} testid={id('name')} label="Full name" value={values.name} onChange={set('name')} error={errors.name} autoComplete="name" />
        <Field id={id('phone')} testid={id('phone')} label="Mobile number" value={values.phone} onChange={set('phone')} error={errors.phone} inputMode="numeric" autoComplete="tel-national" />
      </div>
      <Field id={id('address-line')} testid={id('address-line')} label="Address" value={values.addressLine} onChange={set('addressLine')} error={errors.addressLine} autoComplete="street-address" />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field id={id('city')} testid={id('city')} label="City" value={values.city} onChange={set('city')} error={errors.city} />
        <Field id={id('state')} testid={id('state')} label="State" value={values.state} onChange={set('state')} error={errors.state} />
        <Field id={id('pincode')} testid={id('pincode')} label="Pincode" value={values.pincode} onChange={set('pincode')} error={errors.pincode} inputMode="numeric" autoComplete="postal-code" />
      </div>
      {showDefault && (
        <label className="flex min-h-10 items-center gap-2 text-sm">
          <input type="checkbox" data-testid={id('default')} checked={!!values.isDefault} onChange={set('isDefault')} className="h-5 w-5" />
          Make this my default address
        </label>
      )}
      <div className="flex flex-wrap gap-3">
        <button type="submit" data-testid={id('submit')} className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving...' : 'Save address'}
        </button>
        {onCancel && (
          <button type="button" data-testid={id('cancel')} className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}
