import { formatDate, formatMoney } from '../utils/format'
import { ProductImage, StatusBadge } from './ui'

/** Read-only order details. `p` is the testid prefix (order / confirmation / admin-order). */
export default function OrderView({ order, p = 'order', showCustomer = false }) {
  const free = order.deliveryCharge === 0
  return (
    <div className="space-y-6">
      <section className="card" aria-label="Order summary">
        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-slate-600">Order number</dt>
            <dd data-testid={`${p}-number`} className="font-mono text-lg font-bold">{order.orderNumber}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-600">Placed on</dt>
            <dd data-testid={`${p}-date`}>{formatDate(order.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-600">Status</dt>
            <dd><StatusBadge status={order.status} testid={`${p}-status`} /></dd>
          </div>
          <div>
            <dt className="text-sm text-slate-600">Payment</dt>
            <dd>
              <span data-testid={`${p}-payment-method`}>{order.paymentMethod}</span>{' - '}
              <span data-testid={`${p}-payment-status`}>{order.paymentStatus}</span>
            </dd>
          </div>
        </dl>
      </section>

      {showCustomer && order.customer && (
        <section className="card" aria-label="Customer" data-testid={`${p}-customer`}>
          <h2>Customer</h2>
          <p data-testid={`${p}-customer-name`} className="mt-1 font-medium">{order.customer.name}</p>
          <p data-testid={`${p}-customer-email`}>{order.customer.email}</p>
          <p data-testid={`${p}-customer-phone`}>{order.customer.phone}</p>
        </section>
      )}

      <section className="card" aria-label="Items">
        <h2>Items</h2>
        <ul data-testid={`${p}-items`} className="mt-3 divide-y divide-slate-200">
          {order.items.map((it, i) => (
            <li key={`${it.productId}-${i}`} data-testid={`${p}-item`} className="flex gap-3 py-3">
              <ProductImage src={it.image} alt={it.name} testid={`${p}-item-image`} className="h-16 w-16 shrink-0 rounded" />
              <div className="min-w-0 flex-1">
                <p data-testid={`${p}-item-name`} className="font-medium">{it.name}</p>
                <p className="text-sm text-slate-700">
                  <span data-testid={`${p}-item-unit-price`}>{formatMoney(it.unitPrice)}</span> x{' '}
                  <span data-testid={`${p}-item-quantity`}>{it.quantity}</span>
                </p>
              </div>
              <p data-testid={`${p}-item-total`} className="font-semibold">{formatMoney(it.lineTotal)}</p>
            </li>
          ))}
        </ul>
        <dl className="mt-3 space-y-1 border-t border-slate-200 pt-3 text-sm">
          <div className="flex justify-between"><dt>Subtotal</dt><dd data-testid={`${p}-subtotal`}>{formatMoney(order.subtotal)}</dd></div>
          <div className="flex justify-between">
            <dt>Delivery</dt>
            <dd data-testid={`${p}-delivery`}>{free ? 'Free' : formatMoney(order.deliveryCharge)}</dd>
          </div>
          <div className="flex justify-between text-base font-bold"><dt>Grand total</dt><dd data-testid={`${p}-grand-total`}>{formatMoney(order.grandTotal)}</dd></div>
        </dl>
      </section>

      <section className="card" aria-label="Delivery address" data-testid={`${p}-address`}>
        <h2>Delivery address</h2>
        <address className="mt-2 not-italic">
          <p data-testid={`${p}-address-name`} className="font-medium">{order.address.name}</p>
          <p>{order.address.addressLine}</p>
          <p>{order.address.city}, {order.address.state} - {order.address.pincode}</p>
          <p>Phone: {order.address.phone}</p>
        </address>
      </section>

      <section className="card" aria-label="Status history">
        <h2>Status history</h2>
        <ol data-testid={`${p}-history`} className="mt-3 space-y-2">
          {order.statusHistory.map((h, i) => (
            <li key={i} data-testid={`${p}-history-item`} className="flex flex-wrap items-center gap-2 text-sm">
              <StatusBadge status={h.status} />
              <time dateTime={h.at} data-testid={`${p}-history-time`}>{formatDate(h.at)}</time>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
