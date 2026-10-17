import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { catalogApi } from '../api'
import ProductCard from '../components/ProductCard'
import { EmptyState, ErrorState, Field, Loading, Pagination } from '../components/ui'
import { useFetch, useTitle } from '../utils/hooks'

const SORTS = [
  ['newest', 'Newest'],
  ['price_asc', 'Price: low to high'],
  ['price_desc', 'Price: high to low'],
  ['name_asc', 'Name: A to Z'],
]

function priceError(min, max) {
  const ok = (s) => /^\d+(\.\d{1,2})?$/.test(s)
  if (min && !ok(min)) return 'Enter a valid price'
  if (max && !ok(max)) return 'Enter a valid price'
  if (min && max && Number(min) > Number(max)) return 'Minimum price cannot be more than maximum price'
  return ''
}

export default function Products() {
  useTitle('Products')
  const [sp, setSp] = useSearchParams()
  const q = sp.get('q') || ''
  const category = sp.get('category') || ''
  const minPrice = sp.get('minPrice') || ''
  const maxPrice = sp.get('maxPrice') || ''
  const sort = sp.get('sort') || 'newest'
  const pageParam = sp.get('page') || '1'

  const [form, setForm] = useState({ q, minPrice, maxPrice })
  const [pErr, setPErr] = useState('')
  useEffect(() => {
    setForm({ q, minPrice, maxPrice })
    setPErr('')
  }, [q, minPrice, maxPrice])

  const cats = useFetch(() => catalogApi.categories(), [])
  const list = useFetch(
    () => catalogApi.products({ q, category, minPrice, maxPrice, sort: sort === 'newest' ? '' : sort, page: pageParam }),
    [q, category, minPrice, maxPrice, sort, pageParam],
  )

  function update(changes, { keepPage = false } = {}) {
    const next = { q, category, minPrice, maxPrice, sort, ...changes }
    const params = {}
    if (next.q) params.q = next.q
    if (next.category) params.category = next.category
    if (next.minPrice) params.minPrice = next.minPrice
    if (next.maxPrice) params.maxPrice = next.maxPrice
    if (next.sort && next.sort !== 'newest') params.sort = next.sort
    if (keepPage && changes.page && changes.page !== '1') params.page = changes.page
    setSp(params)
  }

  function apply(e) {
    e.preventDefault()
    const err = priceError(form.minPrice.trim(), form.maxPrice.trim())
    setPErr(err)
    if (err) return
    update({ q: form.q.trim(), minPrice: form.minPrice.trim(), maxPrice: form.maxPrice.trim() })
  }

  const data = list.data
  const hasFilters = !!(q || category || minPrice || maxPrice)

  return (
    <div>
      <h1 data-testid="products-title">Products</h1>
      <div className="mt-4 grid gap-6 lg:grid-cols-[260px_1fr]">
        <form data-testid="products-filters" onSubmit={apply} noValidate className="card h-fit space-y-3" aria-label="Search and filters">
          <Field id="products-search" testid="products-search" type="search" label="Search by name" value={form.q} maxLength={100}
            onChange={(e) => setForm((f) => ({ ...f, q: e.target.value }))} />
          <Field id="products-category" testid="products-category" as="select" label="Category" value={category}
            onChange={(e) => update({ category: e.target.value })}>
            <option value="">All categories</option>
            {cats.data?.items.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field id="products-min-price" testid="products-min-price" label="Min price (₹)" inputMode="decimal" value={form.minPrice}
              onChange={(e) => setForm((f) => ({ ...f, minPrice: e.target.value }))} />
            <Field id="products-max-price" testid="products-max-price" label="Max price (₹)" inputMode="decimal" value={form.maxPrice}
              onChange={(e) => setForm((f) => ({ ...f, maxPrice: e.target.value }))} />
          </div>
          {pErr && <p data-testid="products-price-error" role="alert" className="text-sm text-red-700">{pErr}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="submit" data-testid="products-apply" className="btn btn-primary">Apply</button>
            <button type="button" data-testid="products-clear" className="btn btn-secondary" onClick={() => setSp({})}>Clear filters</button>
          </div>
        </form>

        <section aria-label="Product results">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <p data-testid="products-total" aria-live="polite">
              {data ? `${data.total} product${data.total === 1 ? '' : 's'} found` : ''}
            </p>
            <div className="w-full sm:w-56">
              <Field id="products-sort" testid="products-sort" as="select" label="Sort by" value={sort} onChange={(e) => update({ sort: e.target.value })}>
                {SORTS.map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </Field>
            </div>
          </div>

          {list.loading && <Loading testid="products-loading" />}
          {list.error && (
            <div className="space-y-3">
              <ErrorState testid="products-error" error={list.error} onRetry={list.reload} />
              {list.error.status === 400 && (
                <button type="button" className="btn btn-secondary" data-testid="products-error-clear" onClick={() => setSp({})}>Clear filters</button>
              )}
            </div>
          )}
          {data && data.items.length === 0 && (
            <EmptyState testid="products-empty" message="No products found">
              <div className="flex flex-wrap justify-center gap-3">
                {hasFilters && (
                  <button type="button" data-testid="products-empty-clear" className="btn btn-primary" onClick={() => setSp({})}>Clear filters</button>
                )}
                {data.total > 0 && (
                  <Link to="/products" data-testid="products-first-page" className="btn btn-secondary">Go to page 1</Link>
                )}
              </div>
            </EmptyState>
          )}
          {data && data.items.length > 0 && (
            <>
              <ul data-testid="products-list" className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 xl:grid-cols-3">
                {data.items.map((p) => (
                  <ProductCard key={p.id} product={p} prefix="products" />
                ))}
              </ul>
              <Pagination
                testid="products-pagination"
                page={data.page}
                totalPages={data.totalPages}
                onChange={(p) => {
                  update({ page: String(p) }, { keepPage: true })
                  window.scrollTo({ top: 0 })
                }}
              />
            </>
          )}
        </section>
      </div>
    </div>
  )
}
