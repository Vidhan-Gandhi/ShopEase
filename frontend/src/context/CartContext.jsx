import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { cartApi } from '../api'
import { ApiError } from '../api/client'
import { readGuestCart, writeGuestCart } from '../utils/guestCart'
import { useAuth } from './AuthContext'

const CartContext = createContext(null)

export const EMPTY_CART = {
  items: [],
  itemCount: 0,
  subtotal: 0,
  deliveryCharge: 0,
  grandTotal: 0,
  unavailable: [],
  notices: [],
}

export function CartProvider({ children }) {
  const { user, status, consumeInitialCart } = useAuth()
  const isCustomer = !!user && user.role === 'customer'
  const isAdmin = !!user && user.role === 'admin'

  const [guestItems, setGuestItems] = useState(() => readGuestCart())
  const [cart, setCart] = useState(null) // CartView of the last load
  const [serverCount, setServerCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [notices, setNotices] = useState([])
  const [mergeNotices, setMergeNotices] = useState([])
  const loadSeq = useRef(0)

  const applyView = useCallback((view, { keepNotices = false } = {}) => {
    setCart(view)
    if (!keepNotices || (view.notices && view.notices.length)) setNotices(view.notices || [])
    return view
  }, [])

  const load = useCallback(async () => {
    const seq = ++loadSeq.current
    setLoading(true)
    setError(null)
    try {
      let view
      if (isCustomer) {
        view = await cartApi.get()
        if (seq === loadSeq.current) setServerCount(view.itemCount)
      } else if (isAdmin) {
        view = EMPTY_CART
      } else {
        const local = readGuestCart()
        if (!local.length) view = EMPTY_CART
        else {
          view = await cartApi.validate(local)
          // Remember product names locally so a later-deleted product can still be named in the notice.
          const names = new Map(local.filter((i) => i.name).map((i) => [i.productId, i.name]))
          view.items.forEach((i) => names.set(i.productId, i.name))
          if (view.unavailable && view.unavailable.length) {
            const notices = [...(view.notices || [])]
            view.unavailable = view.unavailable.map((u) => {
              const known = names.get(u.productId)
              if (u.reason !== 'deleted' || !known || u.name === known) return u
              const idx = notices.indexOf(`${u.name} is no longer available`)
              if (idx >= 0) notices[idx] = `${known} is no longer available`
              return { ...u, name: known }
            })
            view.notices = notices
          }
          const synced = view.items.map((i) => ({ productId: i.productId, quantity: i.quantity, name: i.name }))
          writeGuestCart(synced)
          if (seq === loadSeq.current) setGuestItems(synced)
        }
      }
      if (seq === loadSeq.current) applyView(view)
      return view
    } catch (err) {
      if (seq === loadSeq.current) setError(err)
      return null
    } finally {
      if (seq === loadSeq.current) setLoading(false)
    }
  }, [isCustomer, isAdmin, applyView])

  // React to login / logout / bootstrap.
  useEffect(() => {
    if (status === 'loading') return
    setCart(null)
    setNotices([])
    setError(null)
    if (isCustomer) {
      const pre = consumeInitialCart()
      setGuestItems(readGuestCart())
      if (pre) {
        setMergeNotices(pre.notices)
        if (pre.cart) {
          applyView(pre.cart)
          setServerCount(pre.cart.itemCount)
          return
        }
      }
      cartApi.get().then((v) => setServerCount(v.itemCount)).catch(() => {})
    } else {
      setServerCount(0)
      setGuestItems(readGuestCart())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, status])

  const add = useCallback(
    async (product, quantity = 1) => {
      if (isAdmin) throw new ApiError(403, 'Admin accounts cannot place orders')
      if (isCustomer) {
        const view = await cartApi.add(product.id, quantity)
        setServerCount(view.itemCount)
        applyView(view, { keepNotices: true })
        return view
      }
      const local = readGuestCart()
      const existing = local.find((i) => i.productId === product.id)
      const total = (existing ? existing.quantity : 0) + quantity
      if (product.stock <= 0) throw new ApiError(409, 'This product is out of stock')
      if (total > product.stock) throw new ApiError(400, `Only ${product.stock} available`)
      const next = existing
        ? local.map((i) => (i.productId === product.id ? { ...i, quantity: total } : i))
        : [...local, { productId: product.id, quantity, name: product.name }]
      writeGuestCart(next)
      setGuestItems(next)
      return next
    },
    [isAdmin, isCustomer, applyView],
  )

  const setQuantity = useCallback(
    async (line, quantity) => {
      if (isCustomer) {
        const view = await cartApi.setQuantity(line.productId, quantity)
        setServerCount(view.itemCount)
        applyView(view, { keepNotices: true })
        return view
      }
      if (quantity > line.stock) throw new ApiError(400, `Only ${line.stock} available`)
      const next = readGuestCart().map((i) => (i.productId === line.productId ? { ...i, quantity } : i))
      writeGuestCart(next)
      setGuestItems(next)
      return load()
    },
    [isCustomer, applyView, load],
  )

  const remove = useCallback(
    async (line) => {
      if (isCustomer) {
        const view = await cartApi.remove(line.productId)
        setServerCount(view.itemCount)
        applyView(view, { keepNotices: true })
        return view
      }
      const next = readGuestCart().filter((i) => i.productId !== line.productId)
      writeGuestCart(next)
      setGuestItems(next)
      return load()
    },
    [isCustomer, applyView, load],
  )

  /** Called after an order was placed: the server emptied the cart. */
  const clearAfterOrder = useCallback(() => {
    setServerCount(0)
    setCart(EMPTY_CART)
    setNotices([])
  }, [])

  const count = isAdmin ? 0 : isCustomer ? serverCount : guestItems.reduce((s, i) => s + i.quantity, 0)

  const value = useMemo(
    () => ({
      cart, loading, error, notices, mergeNotices, count, load, add, setQuantity, remove,
      clearAfterOrder, setCart: applyView, setServerCount,
      dismissMergeNotices: () => setMergeNotices([]),
    }),
    [cart, loading, error, notices, mergeNotices, count, load, add, setQuantity, remove, clearAfterOrder, applyView],
  )
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  return useContext(CartContext)
}
