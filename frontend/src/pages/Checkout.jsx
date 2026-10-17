import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { addressApi, orderApi } from '../api'
import AddressForm from '../components/AddressForm'
import { ErrorState, FormError, Loading, ProductImage } from '../components/ui'
import { useCart } from '../context/CartContext'
import { formatMoney } from '../utils/format'
import { useFetch, useTitle } from '../utils/hooks'
import { CartTotals } from './Cart'

const STEPS = ['Address', 'Review', 'Payment']

export default function Checkout() {
  useTitle('Checkout')
  const navigate = useNavigate()
  const cart = useCart()
  const addrs = useFetch(() => addressApi.list(), [])

  const [ready, setReady] = useState(false)
  const [step, setStep] = useState(1)
  const [phase, setPhase] = useState('form') // form | mockpay | failed
  const [addressId, setAddressId] = useState('')
  const [addrError, setAddrError] = useState('')
  const [adding, setAdding] = useState(false)
  const [payment, setPayment] = useState('')
  const [changes, setChanges] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState(null)
  const [done, setDone] = useState(false)

  const { load } = cart
  useEffect(() => {
    load().then(() => setReady(true))
  }, [load])

  // Preselect the default address once.
  useEffect(() => {
    if (addrs.data && !addressId) {
      const def = addrs.data.items.find((a) => a.isDefault) || addrs.data.items[0]
      if (def) setAddressId(def.id)
    }
  }, [addrs.data, addressId])

  const view = cart.cart
  const addresses = addrs.data?.items || []
  const selected = addresses.find((a) => a.id === addressId)

  if (cart.error) return <ErrorState testid="checkout-error" error={cart.error} onRetry={() => load()} />
  if (addrs.error) return <ErrorState testid="checkout-error" error={addrs.error} onRetry={addrs.reload} />
  if (!ready || addrs.loading || !view) return <Loading testid="checkout-loading" />
  if (!done && view.items.length === 0) return <Navigate to="/cart" replace />

  function handleFailure(err) {
    if (err.status === 409 && err.data?.changes) {
      setChanges(err.data.changes)
      if (err.data.cart) {
        cart.setCart(err.data.cart)
        cart.setServerCount(err.data.cart.itemCount)
        if (err.data.cart.items.length === 0) {
          navigate('/cart', { replace: true })
          return
        }
      }
      setError('')
      setPhase('form')
      setStep(2)
      return
    }
    if (err.status === 404 && /address/i.test(err.message)) {
      setAddressId('')
      setStep(1)
    }
    if (err.status === 400 && /cart is empty/i.test(err.message)) {
      navigate('/cart', { replace: true })
      return
    }
    setPhase('form')
    setError(err.fields?.paymentMethod || err.message)
  }

  async function submitOrder(body) {
    const res = await orderApi.place(body)
    setDone(true)
    cart.clearAfterOrder()
    navigate(`/order-confirmation/${res.order.id}`, { replace: true })
  }

  async function placeOrder() {
    setError('')
    setBusy(true)
    const body = {
      addressId,
      paymentMethod: payment,
      reviewedItems: view.items.map((i) => ({ productId: i.productId, unitPrice: i.unitPrice, quantity: i.quantity })),
    }
    try {
      await orderApi.check(body)
      setChanges([])
      if (payment === 'COD') await submitOrder(body)
      else {
        setPending(body)
        setPhase('mockpay')
      }
    } catch (err) {
      handleFailure(err)
    } finally {
      setBusy(false)
    }
  }

  async function mockSuccess() {
    setBusy(true)
    try {
      await submitOrder(pending)
    } catch (err) {
      handleFailure(err)
    } finally {
      setBusy(false)
    }
  }

  function mockFailure() {
    // Nothing is sent to the server: no order, no stock change, cart untouched.
    setPending(null)
    setPhase('failed')
  }

  function continueFromAddress() {
    if (!addressId) {
      setAddrError('Select or add a delivery address')
      return
    }
    setAddrError('')
    setStep(2)
  }

  if (phase === 'mockpay') {
    return (
      <div className="mx-auto max-w-md">
        <h1 data-testid="checkout-title">Checkout</h1>
        <section data-testid="checkout-mock-payment" className="card mt-4 space-y-4 text-center" aria-labelledby="mock-title">
          <h2 id="mock-title">Mock payment page</h2>
          <p className="text-sm text-slate-700">This is a simulated payment. No card data is collected.</p>
          <p>Amount to pay</p>
          <p data-testid="checkout-mock-amount" className="text-3xl font-bold">{formatMoney(view.grandTotal)}</p>
          <FormError message={error} testid="checkout-mock-error" />
          <div className="flex flex-wrap justify-center gap-3">
            <button type="button" data-testid="checkout-mock-success" className="btn btn-primary" disabled={busy} onClick={mockSuccess}>Success</button>
            <button type="button" data-testid="checkout-mock-failure" className="btn btn-danger" disabled={busy} onClick={mockFailure}>Failure</button>
          </div>
        </section>
      </div>
    )
  }

  if (phase === 'failed') {
    return (
      <div className="mx-auto max-w-md">
        <h1 data-testid="checkout-title">Checkout</h1>
        <section data-testid="checkout-payment-failed" role="alert" className="card mt-4 space-y-3 border-red-300 text-center">
          <h2>Payment failed. Your order was not placed</h2>
          <p>Your cart has not been changed.</p>
          <Link to="/checkout" data-testid="checkout-back-to-checkout" className="btn btn-primary" onClick={() => { setPhase('form'); setStep(3) }}>
            Back to checkout
          </Link>
        </section>
      </div>
    )
  }

  return (
    <div>
      <h1 data-testid="checkout-title">Checkout</h1>
      <ol data-testid="checkout-steps" className="mt-3 flex flex-wrap gap-2 text-sm" aria-label="Checkout steps">
        {STEPS.map((s, i) => (
          <li key={s} data-testid="checkout-step" aria-current={step === i + 1 ? 'step' : undefined}
            className={`rounded-full px-3 py-1 ${step === i + 1 ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-800'}`}>
            {i + 1}. {s}
          </li>
        ))}
      </ol>

      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {changes.length > 0 && (
            <div data-testid="checkout-changes" role="alert" className="rounded-md border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-semibold">Your order was not placed because something changed. Please review the updated order and place it again.</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {changes.map((c, i) => (
                  <li key={i} data-testid="checkout-change-item">{c.message}</li>
                ))}
              </ul>
            </div>
          )}
          <FormError message={error} testid="checkout-order-error" />

          {step === 1 && (
            <section className="card space-y-4" aria-labelledby="step1-title" data-testid="checkout-step-address">
              <h2 id="step1-title">1. Delivery address</h2>
              {addresses.length > 0 && (
                <fieldset>
                  <legend className="sr-only">Choose a delivery address</legend>
                  <ul data-testid="checkout-address-list" className="space-y-2">
                    {addresses.map((a) => (
                      <li key={a.id} data-testid="checkout-address-item">
                        <label className={`flex min-h-10 cursor-pointer items-start gap-3 rounded-md border p-3 ${addressId === a.id ? 'border-blue-700 bg-blue-50' : 'border-slate-300'}`}>
                          <input type="radio" name="address" data-testid="checkout-address-radio" className="mt-1 h-5 w-5" checked={addressId === a.id}
                            onChange={() => { setAddressId(a.id); setAddrError('') }} />
                          <span className="text-sm">
                            <span className="font-semibold">{a.name}</span>{a.isDefault && <span className="ml-2 text-xs text-green-800">(Default)</span>}<br />
                            {a.addressLine}, {a.city}, {a.state} - {a.pincode}<br />Phone: {a.phone}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </fieldset>
              )}
              {addrError && <p data-testid="checkout-address-error" role="alert" className="text-sm text-red-700">{addrError}</p>}

              {adding || addresses.length === 0 ? (
                <div className="rounded-md border border-slate-200 p-3">
                  <h3 className="mb-2 font-semibold">Add a new address</h3>
                  <AddressForm
                    p="checkout-address-form"
                    onCancel={addresses.length ? () => setAdding(false) : undefined}
                    onSaved={(a) => { setAdding(false); setAddressId(a.id); setAddrError(''); addrs.reload() }}
                  />
                </div>
              ) : (
                <button type="button" data-testid="checkout-address-add" className="btn btn-secondary" onClick={() => setAdding(true)}>Add new address</button>
              )}
              <button type="button" data-testid="checkout-address-continue" className="btn btn-primary" onClick={continueFromAddress}>
                Continue to review
              </button>
            </section>
          )}

          {step === 2 && (
            <section className="card space-y-4" aria-labelledby="step2-title" data-testid="checkout-step-review">
              <h2 id="step2-title">2. Review your order</h2>
              {selected && (
                <p data-testid="checkout-review-address" className="text-sm">
                  <span className="font-semibold">Deliver to: </span>{selected.name}, {selected.addressLine}, {selected.city}, {selected.state} - {selected.pincode}
                </p>
              )}
              <ul data-testid="checkout-review-list" className="divide-y divide-slate-200">
                {view.items.map((i) => (
                  <li key={i.productId} data-testid="checkout-review-item" className="flex gap-3 py-3">
                    <ProductImage src={i.image} alt={i.name} className="h-14 w-14 shrink-0 rounded" />
                    <div className="min-w-0 flex-1 text-sm">
                      <p data-testid="checkout-review-item-name" className="font-medium">{i.name}</p>
                      <p>
                        <span data-testid="checkout-review-item-price">{formatMoney(i.unitPrice)}</span> x{' '}
                        <span data-testid="checkout-review-item-quantity">{i.quantity}</span>
                      </p>
                    </div>
                    <p data-testid="checkout-review-item-total" className="font-semibold">{formatMoney(i.lineTotal)}</p>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-3">
                <button type="button" data-testid="checkout-review-back" className="btn btn-secondary" onClick={() => setStep(1)}>Back</button>
                <button type="button" data-testid="checkout-review-continue" className="btn btn-primary" onClick={() => setStep(3)}>Continue to payment</button>
              </div>
            </section>
          )}

          {step === 3 && (
            <section className="card space-y-4" aria-labelledby="step3-title" data-testid="checkout-step-payment">
              <h2 id="step3-title">3. Payment method</h2>
              <fieldset className="space-y-2">
                <legend className="sr-only">Choose a payment method</legend>
                {[['COD', 'Cash on Delivery', 'checkout-payment-cod'], ['ONLINE', 'Online payment', 'checkout-payment-online']].map(([v, l, t]) => (
                  <label key={v} className={`flex min-h-10 cursor-pointer items-center gap-3 rounded-md border p-3 ${payment === v ? 'border-blue-700 bg-blue-50' : 'border-slate-300'}`}>
                    <input type="radio" name="payment" data-testid={t} className="h-5 w-5" checked={payment === v} onChange={() => setPayment(v)} />
                    {l}
                  </label>
                ))}
              </fieldset>
              <div className="flex flex-wrap gap-3">
                <button type="button" data-testid="checkout-payment-back" className="btn btn-secondary" onClick={() => setStep(2)}>Back</button>
                <button type="button" data-testid="checkout-place-order" className="btn btn-primary" disabled={!payment || busy} onClick={placeOrder}>
                  {busy ? 'Placing order...' : 'Place order'}
                </button>
              </div>
            </section>
          )}
        </div>

        <aside className="card h-fit space-y-3" aria-label="Order totals" data-testid="checkout-summary">
          <h2>Order summary</h2>
          <p className="text-sm">{view.itemCount} item{view.itemCount === 1 ? '' : 's'}</p>
          <CartTotals cart={view} p="checkout" />
        </aside>
      </div>
    </div>
  )
}
