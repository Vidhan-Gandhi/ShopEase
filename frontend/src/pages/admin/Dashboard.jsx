import { Link } from 'react-router-dom'
import { adminApi } from '../../api'
import { EmptyState, ErrorState, Loading, StatusBadge } from '../../components/ui'
import { formatDateOnly, formatMoney } from '../../utils/format'
import { useFetch, useTitle } from '../../utils/hooks'

export default function Dashboard() {
  useTitle('Admin dashboard')
  const { data, loading, error, reload } = useFetch(() => adminApi.dashboard(), [])
  return (
    <div>
      <h1 data-testid="dashboard-title">Admin dashboard</h1>
      <div className="mt-4 space-y-6">
        {loading && <Loading testid="dashboard-loading" />}
        {error && <ErrorState testid="dashboard-error" error={error} onRetry={reload} />}
        {data && (
          <>
            <dl className="grid gap-4 sm:grid-cols-3">
              <div className="card"><dt className="text-sm text-slate-600">Total orders</dt><dd data-testid="dashboard-total-orders" className="text-2xl font-bold">{data.totalOrders}</dd></div>
              <div className="card"><dt className="text-sm text-slate-600">Total revenue</dt><dd data-testid="dashboard-total-revenue" className="text-2xl font-bold">{formatMoney(data.totalRevenue)}</dd></div>
              <div className="card"><dt className="text-sm text-slate-600">Products</dt><dd data-testid="dashboard-total-products" className="text-2xl font-bold">{data.totalProducts}</dd></div>
            </dl>

            <section className="card" aria-labelledby="low-title">
              <h2 id="low-title">Low stock products</h2>
              {data.lowStockProducts.length === 0 ? (
                <p data-testid="dashboard-low-stock-empty" className="mt-2 text-slate-700">No products are low on stock</p>
              ) : (
                <ul data-testid="dashboard-low-stock-list" className="mt-2 divide-y divide-slate-200">
                  {data.lowStockProducts.map((p) => (
                    <li key={p.id} data-testid="dashboard-low-stock-item" className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <Link to={`/admin/products/${p.id}/edit`} data-testid="dashboard-low-stock-name" className="link">{p.name}</Link>
                      <span data-testid="dashboard-low-stock-count" className={p.stock === 0 ? 'font-semibold text-red-700' : 'font-semibold text-amber-800'}>
                        {p.stock === 0 ? 'Out of stock' : `${p.stock} left`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="card" aria-labelledby="recent-title">
              <h2 id="recent-title">Recent orders</h2>
              {data.recentOrders.length === 0 ? (
                <div className="mt-2"><EmptyState testid="dashboard-orders-empty" message="No orders yet" /></div>
              ) : (
                <div className="mt-2 overflow-x-auto">
                  <table data-testid="dashboard-recent-orders" className="w-full min-w-[560px]">
                    <thead>
                      <tr><th className="th">Order</th><th className="th">Customer</th><th className="th">Date</th><th className="th">Total</th><th className="th">Status</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {data.recentOrders.map((o) => (
                        <tr key={o.id} data-testid="dashboard-recent-order-item">
                          <td className="td"><Link to={`/admin/orders/${o.id}`} data-testid="dashboard-recent-order-number" className="link font-mono">{o.orderNumber}</Link></td>
                          <td className="td" data-testid="dashboard-recent-order-customer">{o.customerName}</td>
                          <td className="td" data-testid="dashboard-recent-order-date">{formatDateOnly(o.createdAt)}</td>
                          <td className="td" data-testid="dashboard-recent-order-total">{formatMoney(o.grandTotal)}</td>
                          <td className="td"><StatusBadge status={o.status} testid="dashboard-recent-order-status" /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  )
}
