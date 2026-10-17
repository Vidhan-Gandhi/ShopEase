import { Link, useSearchParams } from 'react-router-dom'
import { adminApi } from '../../api'
import { EmptyState, ErrorState, Field, Loading, Pagination, StatusBadge } from '../../components/ui'
import { formatDateOnly, formatMoney } from '../../utils/format'
import { useFetch, useTitle } from '../../utils/hooks'

const STATUSES = ['All', 'Placed', 'Confirmed', 'Shipped', 'Delivered', 'Cancelled']

export default function AdminOrders() {
  useTitle('Manage orders')
  const [sp, setSp] = useSearchParams()
  const status = sp.get('status') || 'All'
  const page = sp.get('page') || '1'
  const { data, loading, error, reload } = useFetch(
    () => adminApi.orders({ status: status === 'All' ? '' : status, page }),
    [status, page],
  )

  function setParams(next) {
    const p = {}
    if (next.status && next.status !== 'All') p.status = next.status
    if (next.page && next.page > 1) p.page = String(next.page)
    setSp(p)
  }

  return (
    <div>
      <h1 data-testid="admin-orders-title">Orders</h1>
      <div className="mt-4 w-full sm:w-60">
        <Field id="admin-orders-filter" testid="admin-orders-filter" as="select" label="Filter by status" value={status}
          onChange={(e) => setParams({ status: e.target.value, page: 1 })}>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </Field>
      </div>
      <div className="mt-4 space-y-3">
        {loading && <Loading testid="admin-orders-loading" />}
        {error && <ErrorState testid="admin-orders-error" error={error} onRetry={reload} />}
        {data && data.items.length === 0 && <EmptyState testid="admin-orders-empty" message="No orders found" />}
        {data && data.items.length > 0 && (
          <>
            <p data-testid="admin-orders-total" className="text-sm">{data.total} order{data.total === 1 ? '' : 's'}</p>
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <table className="w-full min-w-[640px]" data-testid="admin-orders-list">
                <caption className="sr-only">Orders</caption>
                <thead>
                  <tr><th className="th">Order</th><th className="th">Customer</th><th className="th">Date</th><th className="th">Total</th><th className="th">Status</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {data.items.map((o) => (
                    <tr key={o.id} data-testid="admin-orders-item">
                      <td className="td"><Link to={`/admin/orders/${o.id}`} data-testid="admin-orders-item-number" className="link font-mono">{o.orderNumber}</Link></td>
                      <td className="td" data-testid="admin-orders-item-customer">{o.customer?.name}</td>
                      <td className="td" data-testid="admin-orders-item-date">{formatDateOnly(o.createdAt)}</td>
                      <td className="td" data-testid="admin-orders-item-total">{formatMoney(o.grandTotal)}</td>
                      <td className="td"><StatusBadge status={o.status} testid="admin-orders-item-status" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination testid="admin-orders-pagination" page={data.page} totalPages={data.totalPages} onChange={(n) => setParams({ status, page: n })} />
          </>
        )}
      </div>
    </div>
  )
}
