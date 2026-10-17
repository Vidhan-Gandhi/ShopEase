import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { orderApi } from '../api'
import ConfirmDialog from '../components/ConfirmDialog'
import OrderView from '../components/OrderView'
import { ErrorState, FormError, Loading } from '../components/ui'
import { useFetch, useTitle } from '../utils/hooks'

export function OrderNotFound({ backTo = '/orders', label = 'Back to my orders' }) {
  useTitle('Order not found')
  return (
    <div data-testid="order-not-found" className="card mx-auto max-w-lg text-center">
      <h1>Order not found</h1>
      <p className="mt-2">We could not find this order.</p>
      <Link to={backTo} data-testid="order-not-found-back" className="btn btn-primary mt-4">{label}</Link>
    </div>
  )
}

export default function OrderDetail({ confirmation = false }) {
  const { id } = useParams()
  const { data, loading, error, reload, setData } = useFetch(() => orderApi.get(id), [id])
  const order = data?.order
  useTitle(confirmation ? 'Order placed' : order ? `Order ${order.orderNumber}` : 'Order')
  const [confirm, setConfirm] = useState(false)
  const [actionError, setActionError] = useState('')
  const [busy, setBusy] = useState(false)

  if (loading) return <Loading testid="order-loading" />
  if (error && error.status === 404) return <OrderNotFound />
  if (error) return <ErrorState testid="order-error" error={error} onRetry={reload} />
  if (!order) return null

  async function doCancel() {
    setConfirm(false)
    setActionError('')
    setBusy(true)
    try {
      setData(await orderApi.cancel(order.id))
    } catch (e) {
      setActionError(e.message)
      reload()
    } finally {
      setBusy(false)
    }
  }

  const p = confirmation ? 'confirmation' : 'order'
  return (
    <div className="mx-auto max-w-3xl">
      {confirmation ? (
        <div className="mb-4 rounded-lg border border-green-300 bg-green-50 p-4">
          <h1 data-testid="confirmation-title">Thank you! Your order has been placed</h1>
          <p className="mt-1">
            Your order number is <strong data-testid="confirmation-order-number">{order.orderNumber}</strong>
          </p>
        </div>
      ) : (
        <h1 data-testid="order-title">Order {order.orderNumber}</h1>
      )}
      <div className="mt-4"><FormError message={actionError} testid="order-action-error" /></div>
      <div className="mt-4"><OrderView order={order} p={p} /></div>
      <div className="mt-6 flex flex-wrap gap-3">
        {confirmation ? (
          <>
            <Link to={`/orders/${order.id}`} data-testid="confirmation-view-order" className="btn btn-primary">View order</Link>
            <Link to="/products" data-testid="confirmation-continue" className="btn btn-secondary">Continue shopping</Link>
          </>
        ) : (
          <>
            <Link to="/orders" data-testid="order-back" className="btn btn-secondary">Back to my orders</Link>
            {order.status === 'Placed' && (
              <button type="button" data-testid="order-cancel" className="btn btn-danger" disabled={busy} onClick={() => setConfirm(true)}>
                Cancel order
              </button>
            )}
          </>
        )}
      </div>
      {confirm && (
        <ConfirmDialog
          title="Cancel this order?"
          message={`Order ${order.orderNumber} will be cancelled and the items returned to stock.`}
          confirmLabel="Yes, cancel order"
          onConfirm={doCancel}
          onCancel={() => setConfirm(false)}
        />
      )}
    </div>
  )
}
