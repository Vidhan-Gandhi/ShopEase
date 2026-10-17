import { useState } from 'react'
import { adminApi, catalogApi } from '../../api'
import ConfirmDialog from '../../components/ConfirmDialog'
import { EmptyState, ErrorState, Field, FormError, FormSuccess, Loading } from '../../components/ui'
import { useFetch, useTitle } from '../../utils/hooks'
import { vRange } from '../../utils/validators'

export default function AdminCategories() {
  useTitle('Manage categories')
  const { data, loading, error, reload } = useFetch(() => catalogApi.categories(), [])
  const [name, setName] = useState('')
  const [nameError, setNameError] = useState('')
  const [busy, setBusy] = useState(false)
  const [editId, setEditId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editError, setEditError] = useState('')
  const [confirm, setConfirm] = useState(null)
  const [actionError, setActionError] = useState('')
  const [success, setSuccess] = useState('')

  async function create(e) {
    e.preventDefault()
    setActionError('')
    setSuccess('')
    const err = vRange(name, 'Name', 2, 40)
    setNameError(err)
    if (err) return
    setBusy(true)
    try {
      await adminApi.createCategory({ name: name.trim() })
      setName('')
      setSuccess('Category created')
      reload()
    } catch (er) {
      setNameError(er.fields.name || '')
      if (!er.fields.name) setActionError(er.message)
    } finally {
      setBusy(false)
    }
  }

  async function saveEdit(e) {
    e.preventDefault()
    setActionError('')
    setSuccess('')
    const err = vRange(editName, 'Name', 2, 40)
    setEditError(err)
    if (err) return
    setBusy(true)
    try {
      await adminApi.updateCategory(editId, { name: editName.trim() })
      setEditId(null)
      setSuccess('Category updated')
      reload()
    } catch (er) {
      setEditError(er.fields.name || '')
      if (!er.fields.name) setActionError(er.message)
    } finally {
      setBusy(false)
    }
  }

  async function doDelete() {
    const c = confirm
    setConfirm(null)
    setActionError('')
    setSuccess('')
    try {
      await adminApi.deleteCategory(c.id)
      setSuccess(`Category "${c.name}" deleted`)
      reload()
    } catch (er) {
      setActionError(er.message)
    }
  }

  return (
    <div>
      <h1 data-testid="admin-categories-title">Categories</h1>
      <form data-testid="admin-categories-form" onSubmit={create} noValidate className="mt-4 flex flex-wrap items-start gap-2">
        <div className="w-full sm:w-72">
          <Field id="admin-categories-name" testid="admin-categories-name" label="New category name" value={name} onChange={(e) => setName(e.target.value)} error={nameError} maxLength={60} />
        </div>
        <button type="submit" data-testid="admin-categories-add" className="btn btn-primary sm:mt-6" disabled={busy}>Add category</button>
      </form>

      <div className="mt-4 space-y-3">
        <FormError message={actionError} testid="admin-categories-action-error" />
        <FormSuccess message={success} testid="admin-categories-success" />
        {loading && <Loading testid="admin-categories-loading" />}
        {error && <ErrorState testid="admin-categories-error" error={error} onRetry={reload} />}
        {data && data.items.length === 0 && <EmptyState testid="admin-categories-empty" message="No categories yet" />}
        {data && data.items.length > 0 && (
          <ul data-testid="admin-categories-list" className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
            {data.items.map((c) => (
              <li key={c.id} data-testid="admin-categories-item" className="flex flex-wrap items-start justify-between gap-3 p-3">
                {editId === c.id ? (
                  <form onSubmit={saveEdit} noValidate className="flex w-full flex-wrap items-start gap-2" data-testid="admin-categories-edit-form">
                    <div className="w-full sm:w-72">
                      <Field id={`cat-edit-${c.id}`} testid="admin-categories-edit-name" label="Category name" value={editName} onChange={(e) => setEditName(e.target.value)} error={editError} maxLength={60} />
                    </div>
                    <button type="submit" data-testid="admin-categories-edit-save" className="btn btn-primary sm:mt-6" disabled={busy}>Save</button>
                    <button type="button" data-testid="admin-categories-edit-cancel" className="btn btn-secondary sm:mt-6" onClick={() => setEditId(null)}>Cancel</button>
                  </form>
                ) : (
                  <>
                    <div>
                      <p data-testid="admin-categories-item-name" className="font-medium">{c.name}</p>
                      <p data-testid="admin-categories-item-count" className="text-xs text-slate-600">{c.productCount} product{c.productCount === 1 ? '' : 's'}</p>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" data-testid="admin-categories-edit" className="btn btn-secondary" aria-label={`Rename ${c.name}`}
                        onClick={() => { setEditId(c.id); setEditName(c.name); setEditError('') }}>Rename</button>
                      <button type="button" data-testid="admin-categories-delete" className="btn btn-danger" aria-label={`Delete ${c.name}`} onClick={() => setConfirm(c)}>Delete</button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {confirm && (
        <ConfirmDialog
          title="Delete category?"
          message={`Delete the category "${confirm.name}"? This cannot be undone.`}
          confirmLabel="Delete category"
          onConfirm={doDelete}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  )
}
