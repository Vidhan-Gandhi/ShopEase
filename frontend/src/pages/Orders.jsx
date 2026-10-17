import { Link, useSearchParams } from 'react-router-dom'
import { orderApi } from '../api'
import { EmptyState, ErrorState, Loading, Pagination, StatusBadge } from '../components/ui'
import { formatDateOnly, formatMoney } from '../utils/format'
import { useFetch, useTitle } from '../utils/hooks'

export default function Orders() {
  useTitle('My orders')
  const [sp, setSp] = useSearchParams()
  const page = sp.get('page') || '1'
  const { data, loading, error, reload } = useFetch(() => orderApi.list(page), [page])

  return (
    <div>
      <h1 data-testid="orders-title">My orders</h1>
      <div className="mt-4">
        {loading && <Loading testid="orders-loading" />}
        {error && <ErrorState testid="orders-error" error={error} onRetry={reload} />}
        {data && data.items.length === 0 && (
          <EmptyState testid="orders-empty" message="You have not placed any orders yet">
            <Link to="/products" data-testid="orders-start-shopping" className="btn btn-primary">Start shopping</Link>
          </EmptyState>
        )}
        {data && data.items.length > 0 && (
          <>
            <p data-testid="orders-total" className="mb-2 text-sm">{data.total} order{data.total === 1 ? '' : 's'}</p>
            <ul data-testid="orders-list" className="space-y-3">
              {data.items.map((o) => (
                <li key={o.id} data-testid="orders-item" className="card flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <Link to={`/orders/${o.id}`} data-testid="orders-item-number" className="link font-mono font-semibold">{o.orderNumber}</Link>
                    <p data-testid="orders-item-date" className="text-sm text-slate-700">{formatDateOnly(o.createdAt)} - {o.itemCount} item{o.itemCount === 1 ? '' : 's'}</p>
                  </div>
                  <StatusBadge status={o.status} testid="orders-item-status" />
                  <p data-testid="orders-item-total" className="font-bold">{formatMoney(o.grandTotal)}</p>
                </li>
              ))}
            </ul>
            <Pagination testid="orders-pagination" page={data.page} totalPages={data.totalPages} onChange={(p) => setSp(p > 1 ? { page: String(p) } : {})} />
          </>
        )}
      </div>
    </div>
  )
}
