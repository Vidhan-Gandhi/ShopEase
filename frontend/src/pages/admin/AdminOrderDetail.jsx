import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { adminApi } from '../../api'
import ConfirmDialog from '../../components/ConfirmDialog'
import OrderView from '../../components/OrderView'
import { ErrorState, FormError, Loading } from '../../components/ui'
import { useFetch, useTitle } from '../../utils/hooks'
import { OrderNotFound } from '../OrderDetail'

const NEXT = { Placed: 'Confirmed', Confirmed: 'Shipped', Shipped: 'Delivered' }

export default function AdminOrderDetail() {
  const { id } = useParams()
  const { data, loading, error, reload, setData } = useFetch(() => adminApi.order(id), [id])
  const order = data?.order
  useTitle(order ? `Order ${order.orderNumber}` : 'Order')
  const [confirm, setConfirm] = useState(false)
  const [actionError, setActionError] = useState('')
  const [busy, setBusy] = useState(false)

  if (loading) return <Loading testid="admin-order-loading" />
  if (error && error.status === 404) return <OrderNotFound backTo="/admin/orders" label="Back to orders" />
  if (error) return <ErrorState testid="admin-order-error" error={error} onRetry={reload} />
  if (!order) return null

  async function change(status) {
    setActionError('')
    setBusy(true)
    try {
      setData(await adminApi.setOrderStatus(order.id, status))
    } catch (e) {
      setActionError(e.message)
      reload()
    } finally {
      setBusy(false)
    }
  }

  async function doCancel() {
    setConfirm(false)
    await change('Cancelled')
  }

  const next = NEXT[order.status]
  const canCancel = ['Placed', 'Confirmed', 'Shipped'].includes(order.status)
  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/admin/orders" data-testid="admin-order-back" className="link inline-block py-2">&larr; Back to orders</Link>
      <h1 data-testid="admin-order-title">Order {order.orderNumber}</h1>
      <div className="mt-4 space-y-4">
        <FormError message={actionError} testid="admin-order-action-error" />
        {(next || canCancel) && (
          <div data-testid="admin-order-actions" className="flex flex-wrap gap-3">
            {next && (
              <button type="button" data-testid="admin-order-advance" className="btn btn-primary" disabled={busy} onClick={() => change(next)}>
                Move to {next}
              </button>
            )}
            {canCancel && (
              <button type="button" data-testid="admin-order-cancel" className="btn btn-danger" disabled={busy} onClick={() => setConfirm(true)}>
                Cancel order
              </button>
            )}
          </div>
        )}
        <OrderView order={order} p="admin-order" showCustomer />
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
