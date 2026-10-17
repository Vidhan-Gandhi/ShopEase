import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AdminBlocked } from '../components/Guard'
import { EmptyState, ErrorState, Loading, NoticeList, ProductImage } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useCart } from '../context/CartContext'
import { formatMoney } from '../utils/format'
import { useTitle } from '../utils/hooks'
import { vQuantity } from '../utils/validators'

export function CartTotals({ cart, p = 'cart' }) {
  return (
    <dl className="space-y-1 text-sm">
      <div className="flex justify-between"><dt>Subtotal</dt><dd data-testid={`${p}-subtotal`}>{formatMoney(cart.subtotal)}</dd></div>
      <div className="flex justify-between">
        <dt>Delivery</dt>
        <dd data-testid={`${p}-delivery`}>{cart.deliveryCharge === 0 ? 'Free' : formatMoney(cart.deliveryCharge)}</dd>
      </div>
      <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold">
        <dt>Grand total</dt><dd data-testid={`${p}-grand-total`}>{formatMoney(cart.grandTotal)}</dd>
      </div>
    </dl>
  )
}

function CartLine({ line, onUpdate, onRemove }) {
  const [qty, setQty] = useState(String(line.quantity))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => setQty(String(line.quantity)), [line.quantity])

  async function update() {
    setError('')
    const v = vQuantity(qty)
    if (v) {
      setError(v)
      setQty(String(line.quantity)) // keep the previous valid quantity
      return
    }
    if (Number(qty) === line.quantity) return
    setBusy(true)
    try {
      await onUpdate(line, Number(qty))
    } catch (e) {
      setError(e.message)
      setQty(String(line.quantity))
    } finally {
      setBusy(false)
    }
  }
  async function remove() {
    setBusy(true)
    try {
      await onRemove(line)
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }

  const discounted = line.discountedPrice !== null && line.discountedPrice !== undefined
  return (
    <li data-testid="cart-item" className="card flex flex-col gap-3 sm:flex-row">
      <ProductImage src={line.image} alt={line.name} testid="cart-item-image" className="h-24 w-24 shrink-0 rounded" />
      <div className="min-w-0 flex-1 space-y-1">
        <Link to={`/products/${line.productId}`} data-testid="cart-item-name" className="font-semibold hover:underline">{line.name}</Link>
        <p className="text-sm">
          <span data-testid="cart-item-price">{formatMoney(line.unitPrice)}</span>
          {discounted && <s data-testid="cart-item-original-price" className="ml-2 text-slate-600">{formatMoney(line.price)}</s>}
        </p>
        <p className="text-xs text-slate-600">{line.stock} in stock</p>
        <div className="flex flex-wrap items-end gap-2 pt-1">
          <div className="w-24">
            <label htmlFor={`qty-${line.productId}`} className="mb-1 block text-xs font-medium">Quantity</label>
            <input
              id={`qty-${line.productId}`}
              data-testid="cart-item-quantity"
              className={`input ${error ? 'input-error' : ''}`}
              inputMode="numeric"
              value={qty}
              aria-invalid={error ? 'true' : 'false'}
              aria-describedby={error ? `qty-err-${line.productId}` : undefined}
              onChange={(e) => setQty(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') update() }}
            />
          </div>
          <button type="button" data-testid="cart-item-update" className="btn btn-secondary" disabled={busy} onClick={update}>Update</button>
          <button type="button" data-testid="cart-item-remove" className="btn btn-secondary" disabled={busy} onClick={remove}>Remove</button>
        </div>
        {error && <p id={`qty-err-${line.productId}`} data-testid="cart-item-error" role="alert" className="text-sm text-red-700">{error}</p>}
      </div>
      <p className="text-right font-bold sm:w-28">
        <span className="sr-only">Line total </span>
        <span data-testid="cart-item-total">{formatMoney(line.lineTotal)}</span>
      </p>
    </li>
  )
}

export default function Cart() {
  useTitle('Your cart')
  const { user } = useAuth()
  const cart = useCart()
  const navigate = useNavigate()
  const { load } = cart

  useEffect(() => {
    if (user?.role !== 'admin') load()
  }, [load, user?.role])

  if (user?.role === 'admin') return <AdminBlocked />

  const view = cart.cart
  function checkout() {
    if (user) navigate('/checkout')
    else navigate('/login', { state: { from: '/checkout' } })
  }

  return (
    <div>
      <h1 data-testid="cart-title">Your cart</h1>
      <div className="mt-4 space-y-4">
        {cart.loading && !view && <Loading testid="cart-loading" />}
        {cart.error && <ErrorState testid="cart-error" error={cart.error} onRetry={load} />}
        {view && (
          <>
            <NoticeList notices={cart.notices} testid="cart-notices" />
            {view.unavailable.length > 0 && (
              <div data-testid="cart-unavailable" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900">
                <p className="font-semibold">These items are unavailable and were left out of your totals:</p>
                <ul className="list-disc pl-5">
                  {view.unavailable.map((u) => (
                    <li key={u.productId} data-testid="cart-unavailable-item">{u.name} ({u.reason === 'deleted' ? 'no longer available' : 'out of stock'})</li>
                  ))}
                </ul>
              </div>
            )}
            {view.items.length === 0 ? (
              <EmptyState testid="cart-empty" message="Your cart is empty">
                <Link to="/products" data-testid="cart-continue" className="btn btn-primary">Continue shopping</Link>
              </EmptyState>
            ) : (
              <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
                <ul data-testid="cart-list" className="space-y-3">
                  {view.items.map((line) => (
                    <CartLine key={line.productId} line={line} onUpdate={cart.setQuantity} onRemove={cart.remove} />
                  ))}
                </ul>
                <aside className="card h-fit space-y-4" aria-label="Order totals" data-testid="cart-summary">
                  <h2>Order summary</h2>
                  <CartTotals cart={view} />
                  <button type="button" data-testid="cart-checkout" className="btn btn-primary w-full" onClick={checkout}>
                    Checkout
                  </button>
                  <Link to="/products" data-testid="cart-continue" className="link block text-center">Continue shopping</Link>
                </aside>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
