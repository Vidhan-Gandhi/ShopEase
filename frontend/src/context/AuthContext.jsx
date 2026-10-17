import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi, cartApi, profileApi } from '../api'
import { getToken, setToken } from '../api/client'
import { clearGuestCart, readGuestCart } from '../utils/guestCart'

const AuthContext = createContext(null)

const PROTECTED_PREFIXES = ['/profile', '/checkout', '/orders', '/order-confirmation', '/admin']

export function AuthProvider({ children }) {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [status, setStatus] = useState(getToken() ? 'loading' : 'ready') // loading | ready | error
  const [bootError, setBootError] = useState(null)
  const initialCart = useRef(null)

  const bootstrap = useCallback(async () => {
    if (!getToken()) {
      setStatus('ready')
      return
    }
    setStatus('loading')
    try {
      const { user: u } = await profileApi.get()
      setUser(u)
      setStatus('ready')
    } catch (err) {
      if (err.status === 401) {
        setToken(null)
        setUser(null)
        setStatus('ready')
      } else {
        setBootError(err)
        setStatus('error')
      }
    }
  }, [])

  useEffect(() => {
    bootstrap()
  }, [bootstrap])

  useEffect(() => {
    function onExpired(ev) {
      setToken(null)
      setUser(null)
      const path = window.location.pathname + window.location.search
      if (PROTECTED_PREFIXES.some((p) => window.location.pathname.startsWith(p))) {
        navigate('/login', { replace: true, state: { message: ev.detail, from: path } })
      }
    }
    window.addEventListener('auth:expired', onExpired)
    return () => window.removeEventListener('auth:expired', onExpired)
  }, [navigate])

  /** After a successful login/signup: store token, merge the guest cart (customers only), then set the user. */
  const completeAuth = useCallback(async ({ token, user: u }) => {
    setToken(token)
    initialCart.current = null
    if (u.role === 'customer') {
      const items = readGuestCart()
      if (items.length) {
        try {
          const view = await cartApi.merge(items)
          clearGuestCart()
          initialCart.current = { cart: view, notices: view.notices || [] }
        } catch (err) {
          initialCart.current = {
            cart: null,
            notices: [`Your guest cart could not be merged: ${err.message}`],
          }
        }
      }
    }
    setUser(u)
    return u
  }, [])

  const login = useCallback(async (email, password) => completeAuth(await authApi.login({ email, password })), [completeAuth])
  const signup = useCallback(
    async (name, email, password) => completeAuth(await authApi.signup({ name, email, password })),
    [completeAuth],
  )
  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
  }, [])
  const consumeInitialCart = useCallback(() => {
    const v = initialCart.current
    initialCart.current = null
    return v
  }, [])

  const value = useMemo(
    () => ({ user, setUser, status, bootError, bootstrap, login, signup, logout, consumeInitialCart }),
    [user, status, bootError, bootstrap, login, signup, logout, consumeInitialCart],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
