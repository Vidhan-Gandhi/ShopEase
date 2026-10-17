import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useCart } from '../context/CartContext'
import { useToast } from '../context/ToastContext'
import { formatMoney } from '../utils/format'
import { ProductImage } from './ui'

export function PriceBlock({ product, prefix }) {
  const discounted = product.discountedPrice !== null && product.discountedPrice !== undefined
  return (
    <p className="flex flex-wrap items-baseline gap-2">
      <span data-testid={`${prefix}-price`} className="text-lg font-bold">{formatMoney(product.effectivePrice)}</span>
      {discounted && (
        <s data-testid={`${prefix}-original-price`} className="text-sm text-slate-600">{formatMoney(product.price)}</s>
      )}
    </p>
  )
}

export function stockClass(product) {
  if (product.stock === 0) return 'text-red-700'
  if (product.stock <= 5) return 'text-amber-800'
  return 'text-green-800'
}

export default function ProductCard({ product, prefix }) {
  const { user } = useAuth()
  const cart = useCart()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const out = product.stock === 0

  async function add() {
    setBusy(true)
    try {
      await cart.add(product, 1)
      toast.show(`${product.name} added to cart`)
    } catch (err) {
      toast.show(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <li data-testid={`${prefix}-item`} className="card flex flex-col">
      <Link to={`/products/${product.id}`} data-testid={`${prefix}-item-link`} className="block" aria-label={product.name}>
        <ProductImage src={product.images?.[0]} alt={product.name} testid={`${prefix}-item-image`} className="aspect-square w-full rounded-md" />
      </Link>
      <h3 className="mt-3 text-base font-semibold">
        <Link to={`/products/${product.id}`} data-testid={`${prefix}-item-name`} className="hover:underline">{product.name}</Link>
      </h3>
      <p data-testid={`${prefix}-item-category`} className="text-xs text-slate-600">{product.category?.name}</p>
      <div className="mt-1">
        <PriceBlock product={product} prefix={`${prefix}-item`} />
      </div>
      <p data-testid={`${prefix}-item-stock`} className={`text-sm font-medium ${stockClass(product)}`}>
        {out ? 'Out of stock' : product.stockStatus}
      </p>
      {user?.role !== 'admin' && (
        <button
          type="button"
          data-testid={`${prefix}-item-add`}
          className="btn btn-primary mt-3"
          disabled={out || busy}
          onClick={add}
        >
          {out ? 'Out of stock' : 'Add to cart'}
        </button>
      )}
    </li>
  )
}
