import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { adminApi } from '../../api'
import ConfirmDialog from '../../components/ConfirmDialog'
import { EmptyState, ErrorState, Field, FormError, FormSuccess, Loading, Pagination, ProductImage } from '../../components/ui'
import { formatMoney } from '../../utils/format'
import { useFetch, useTitle } from '../../utils/hooks'

export default function AdminProducts() {
  useTitle('Manage products')
  const [sp, setSp] = useSearchParams()
  const q = sp.get('q') || ''
  const page = sp.get('page') || '1'
  const [text, setText] = useState(q)
  useEffect(() => setText(q), [q])
  const { data, loading, error, reload } = useFetch(() => adminApi.products({ q, page }), [q, page])
  const [confirm, setConfirm] = useState(null)
  const [actionError, setActionError] = useState('')
  const [success, setSuccess] = useState('')

  function search(e) {
    e.preventDefault()
    const t = text.trim()
    setSp(t ? { q: t } : {})
  }

  async function doDelete() {
    const p = confirm
    setConfirm(null)
    setActionError('')
    setSuccess('')
    try {
      await adminApi.deleteProduct(p.id)
      setSuccess(`Product "${p.name}" deleted`)
      reload()
    } catch (e) {
      setActionError(e.message)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 data-testid="admin-products-title">Products</h1>
        <Link to="/admin/products/new" data-testid="admin-products-new" className="btn btn-primary">Add product</Link>
      </div>
      <form onSubmit={search} data-testid="admin-products-search-form" className="mt-4 flex flex-wrap items-end gap-2" role="search">
        <div className="w-full sm:w-72">
          <Field id="admin-products-search" testid="admin-products-search" type="search" label="Search products by name" value={text} onChange={(e) => setText(e.target.value)} maxLength={100} />
        </div>
        <button type="submit" data-testid="admin-products-search-submit" className="btn btn-primary">Search</button>
        {q && <button type="button" data-testid="admin-products-search-clear" className="btn btn-secondary" onClick={() => setSp({})}>Clear</button>}
      </form>

      <div className="mt-4 space-y-3">
        <FormError message={actionError} testid="admin-products-action-error" />
        <FormSuccess message={success} testid="admin-products-success" />
        {loading && <Loading testid="admin-products-loading" />}
        {error && <ErrorState testid="admin-products-error" error={error} onRetry={reload} />}
        {data && data.items.length === 0 && <EmptyState testid="admin-products-empty" message="No products found" />}
        {data && data.items.length > 0 && (
          <>
            <p data-testid="admin-products-total" className="text-sm">{data.total} product{data.total === 1 ? '' : 's'}</p>
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <table className="w-full min-w-[700px]" data-testid="admin-products-list">
                <caption className="sr-only">Products</caption>
                <thead>
                  <tr><th className="th">Product</th><th className="th">Category</th><th className="th">Price</th><th className="th">Stock</th><th className="th">Featured</th><th className="th">Actions</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {data.items.map((p) => (
                    <tr key={p.id} data-testid="admin-products-item">
                      <td className="td">
                        <div className="flex items-center gap-2">
                          <ProductImage src={p.images?.[0]} alt={p.name} className="h-10 w-10 rounded" />
                          <span data-testid="admin-products-item-name" className="font-medium">{p.name}</span>
                        </div>
                      </td>
                      <td className="td" data-testid="admin-products-item-category">{p.category?.name}</td>
                      <td className="td" data-testid="admin-products-item-price">
                        {formatMoney(p.effectivePrice)}
                        {p.discountedPrice !== null && <s className="ml-1 text-slate-600">{formatMoney(p.price)}</s>}
                      </td>
                      <td className="td" data-testid="admin-products-item-stock">{p.stock}</td>
                      <td className="td" data-testid="admin-products-item-featured">{p.featured ? 'Yes' : 'No'}</td>
                      <td className="td">
                        <div className="flex gap-2">
                          <Link to={`/admin/products/${p.id}/edit`} data-testid="admin-products-edit" className="btn btn-secondary" aria-label={`Edit ${p.name}`}>Edit</Link>
                          <button type="button" data-testid="admin-products-delete" className="btn btn-danger" aria-label={`Delete ${p.name}`} onClick={() => setConfirm(p)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination testid="admin-products-pagination" page={data.page} totalPages={data.totalPages}
              onChange={(n) => setSp({ ...(q ? { q } : {}), ...(n > 1 ? { page: String(n) } : {}) })} />
          </>
        )}
      </div>
      {confirm && (
        <ConfirmDialog
          title="Delete product?"
          message={`Delete "${confirm.name}"? It will disappear from the store. Past orders keep their details.`}
          confirmLabel="Delete product"
          onConfirm={doDelete}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  )
}
