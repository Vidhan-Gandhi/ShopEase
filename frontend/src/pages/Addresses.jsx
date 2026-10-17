import { useState } from 'react'
import { addressApi } from '../api'
import AccountNav from '../components/AccountNav'
import AddressForm from '../components/AddressForm'
import ConfirmDialog from '../components/ConfirmDialog'
import { EmptyState, ErrorState, FormError, Loading } from '../components/ui'
import { useFetch, useTitle } from '../utils/hooks'

export default function Addresses() {
  useTitle('My addresses')
  const { data, loading, error, reload, setData } = useFetch(() => addressApi.list(), [])
  const [editing, setEditing] = useState(null) // address | 'new' | null
  const [confirm, setConfirm] = useState(null)
  const [actionError, setActionError] = useState('')
  const [busyId, setBusyId] = useState(null)

  async function makeDefault(a) {
    setActionError('')
    setBusyId(a.id)
    try {
      setData(await addressApi.setDefault(a.id))
    } catch (e) {
      setActionError(e.message)
    } finally {
      setBusyId(null)
    }
  }

  async function doDelete() {
    const a = confirm
    setConfirm(null)
    setActionError('')
    try {
      setData(await addressApi.remove(a.id))
    } catch (e) {
      setActionError(e.message)
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 data-testid="addresses-title">My addresses</h1>
      <div className="mt-4"><AccountNav /></div>
      <FormError message={actionError} testid="addresses-action-error" />

      {loading && <Loading testid="addresses-loading" />}
      {error && <ErrorState testid="addresses-error" error={error} onRetry={reload} />}

      {data && (
        <div className="mt-4 space-y-4">
          {data.items.length === 0 && !editing && (
            <EmptyState testid="addresses-empty" message="You have no saved addresses yet" />
          )}
          {data.items.length > 0 && (
            <ul data-testid="addresses-list" className="grid gap-3 sm:grid-cols-2">
              {data.items.map((a) => (
                <li key={a.id} data-testid="addresses-item" className="card space-y-1">
                  {editing && editing.id === a.id ? (
                    <AddressForm
                      p="addresses-edit-form"
                      address={a}
                      onCancel={() => setEditing(null)}
                      onSaved={() => { setEditing(null); reload() }}
                    />
                  ) : (
                    <>
                      <p className="flex flex-wrap items-center gap-2 font-semibold">
                        <span data-testid="addresses-item-name">{a.name}</span>
                        {a.isDefault && <span data-testid="addresses-item-default" className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-900">Default</span>}
                      </p>
                      <p data-testid="addresses-item-line">{a.addressLine}</p>
                      <p data-testid="addresses-item-city">{a.city}, {a.state} - {a.pincode}</p>
                      <p data-testid="addresses-item-phone">Phone: {a.phone}</p>
                      <div className="flex flex-wrap gap-2 pt-2">
                        <button type="button" data-testid="addresses-edit" className="btn btn-secondary" onClick={() => setEditing(a)}>Edit</button>
                        {!a.isDefault && (
                          <button type="button" data-testid="addresses-set-default" className="btn btn-secondary" disabled={busyId === a.id} onClick={() => makeDefault(a)}>Make default</button>
                        )}
                        <button type="button" data-testid="addresses-delete" className="btn btn-danger" onClick={() => setConfirm(a)}>Delete</button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}

          {editing === 'new' ? (
            <div className="card">
              <h2>Add a new address</h2>
              <div className="mt-3">
                <AddressForm p="addresses-form" onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); reload() }} />
              </div>
            </div>
          ) : (
            <button type="button" data-testid="addresses-add" className="btn btn-primary" onClick={() => setEditing('new')}>Add new address</button>
          )}
        </div>
      )}

      {confirm && (
        <ConfirmDialog
          title="Delete address?"
          message={`Delete the address for ${confirm.name} (${confirm.city})? This cannot be undone.`}
          confirmLabel="Delete address"
          onConfirm={doDelete}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  )
}
