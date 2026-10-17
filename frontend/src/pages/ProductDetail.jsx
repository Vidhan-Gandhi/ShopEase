import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { catalogApi } from '../api'
import { PriceBlock, stockClass } from '../components/ProductCard'
import { ErrorState, Field, FormError, FormSuccess, Loading, ProductImage } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useCart } from '../context/CartContext'
import { useFetch, useTitle } from '../utils/hooks'
import { vQuantity } from '../utils/validators'

export default function ProductDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const cart = useCart()
  const { data, loading, error, reload } = useFetch(() => catalogApi.product(id), [id])
  const product = data?.product
  useTitle(product ? product.name : error?.status === 404 ? 'Product not found' : 'Product')

  const [selected, setSelected] = useState(0)
  const [qty, setQty] = useState('1')
  const [qtyError, setQtyError] = useState('')
  const [msg, setMsg] = useState({ type: '', text: '' })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setSelected(0)
    setQty('1')
    setQtyError('')
    setMsg({ type: '', text: '' })
  }, [id])

  if (loading) return <Loading testid="product-loading" />
  if (error && error.status === 404) {
    return (
      <div data-testid="product-not-found" className="card mx-auto max-w-lg text-center">
        <h1>Product not found</h1>
        <p className="mt-2">This product does not exist or is no longer available.</p>
        <Link to="/products" data-testid="product-back-to-listing" className="btn btn-primary mt-4">Back to products</Link>
      </div>
    )
  }
  if (error) return <ErrorState testid="product-error" error={error} onRetry={reload} />
  if (!product) return null

  const out = product.stock === 0
  const isAdmin = user?.role === 'admin'

  async function add() {
    setMsg({ type: '', text: '' })
    const err = vQuantity(qty)
    setQtyError(err)
    if (err) return
    setBusy(true)
    try {
      await cart.add(product, Number(qty))
      setMsg({ type: 'success', text: `Added to cart (${qty})` })
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    } finally {
      setBusy(false)
    }
  }

  const images = product.images?.length ? product.images : [null]
  return (
    <div>
      <Link to="/products" data-testid="product-back" className="link inline-block py-2">&larr; Back to products</Link>
      <div className="mt-2 grid gap-6 md:grid-cols-2">
        <div>
          <ProductImage src={images[selected]} alt={product.name} testid="product-main-image" className="aspect-square w-full rounded-lg" />
          {images.length > 1 && (
            <ul data-testid="product-thumbs" className="mt-3 flex flex-wrap gap-2">
              {images.map((src, i) => (
                <li key={i}>
                  <button
                    type="button"
                    data-testid="product-thumb"
                    aria-label={`Show image ${i + 1} of ${images.length}`}
                    aria-pressed={i === selected}
                    onClick={() => setSelected(i)}
                    className={`rounded-md border-2 p-0.5 ${i === selected ? 'border-blue-700' : 'border-transparent'}`}
                  >
                    <ProductImage src={src} alt={`${product.name} - view ${i + 1}`} className="h-16 w-16 rounded" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="space-y-3">
          <h1 data-testid="product-name">{product.name}</h1>
          <p className="text-sm text-slate-700">
            Category: <span data-testid="product-category">{product.category?.name}</span>
          </p>
          <div className="text-xl"><PriceBlock product={product} prefix="product" /></div>
          <p data-testid="product-stock" className={`font-semibold ${stockClass(product)}`}>
            {out ? 'Out of stock' : product.stockStatus}
          </p>
          <p data-testid="product-description" className="whitespace-pre-line text-slate-800">{product.description}</p>

          {isAdmin ? (
            <p data-testid="product-admin-note" className="rounded-md bg-slate-100 p-3 text-sm">Admin accounts cannot place orders.</p>
          ) : (
            <div className="space-y-3 border-t border-slate-200 pt-3">
              <div className="w-32">
                <Field id="product-quantity" testid="product-quantity" label="Quantity" inputMode="numeric" value={qty}
                  onChange={(e) => setQty(e.target.value)} error={qtyError} disabled={out} />
              </div>
              <button type="button" data-testid="product-add-to-cart" className="btn btn-primary w-full sm:w-auto" disabled={out || busy} onClick={add}>
                {out ? 'Out of stock' : busy ? 'Adding...' : 'Add to cart'}
              </button>
              <FormError message={msg.type === 'error' ? msg.text : ''} testid="product-cart-error" />
              <FormSuccess message={msg.type === 'success' ? msg.text : ''} testid="product-cart-message" />
              {msg.type === 'success' && (
                <Link to="/cart" data-testid="product-view-cart" className="link inline-block py-2">View cart</Link>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
