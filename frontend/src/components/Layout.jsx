import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useCart } from '../context/CartContext'
import { NoticeList } from './ui'

const navClass = ({ isActive }) =>
  `inline-flex min-h-10 items-center rounded-md px-3 py-2 text-sm font-medium ${
    isActive ? 'bg-blue-100 text-blue-900' : 'text-slate-800 hover:bg-slate-100'
  }`

export default function Layout() {
  const { user, logout } = useAuth()
  const cart = useCart()
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)

  useEffect(() => setOpen(false), [location.pathname])

  function onLogout() {
    logout()
    navigate('/')
  }

  const isAdmin = user?.role === 'admin'
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:p-2">
        Skip to content
      </a>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2">
          <Link to="/" data-testid="header-logo" className="text-xl font-extrabold text-blue-800">
            ShopEase
          </Link>
          <button
            type="button"
            data-testid="header-menu-toggle"
            className="btn btn-secondary md:hidden"
            aria-expanded={open}
            aria-controls="main-nav"
            onClick={() => setOpen((o) => !o)}
          >
            {open ? 'Close menu' : 'Menu'}
          </button>
          <nav
            id="main-nav"
            aria-label="Main"
            data-testid="header-nav"
            className={`${open ? 'flex' : 'hidden'} w-full flex-col gap-1 md:flex md:w-auto md:flex-row md:items-center`}
          >
            <NavLink to="/" end data-testid="header-home" className={navClass}>Home</NavLink>
            <NavLink to="/products" data-testid="header-products" className={navClass}>Products</NavLink>
            {!isAdmin && (
              <NavLink to="/cart" data-testid="header-cart" className={navClass}>
                Cart (<span data-testid="header-cart-count">{cart.count}</span>)
              </NavLink>
            )}
            {user?.role === 'customer' && (
              <NavLink to="/orders" data-testid="header-orders" className={navClass}>My orders</NavLink>
            )}
            {isAdmin && <NavLink to="/admin" data-testid="header-admin" className={navClass}>Admin</NavLink>}
            {user ? (
              <>
                <NavLink to="/profile" data-testid="header-profile" className={navClass}>
                  <span data-testid="header-user-name">{user.name}</span>
                </NavLink>
                <button type="button" data-testid="header-logout" className="btn btn-secondary" onClick={onLogout}>
                  Log out
                </button>
              </>
            ) : (
              <>
                <NavLink to="/login" data-testid="header-login" className={navClass}>Log in</NavLink>
                <NavLink to="/signup" data-testid="header-signup" className={navClass}>Sign up</NavLink>
              </>
            )}
          </nav>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        {cart.mergeNotices.length > 0 && (
          <div className="mb-4">
            <NoticeList notices={cart.mergeNotices} testid="merge-notices" onDismiss={cart.dismissMergeNotices} />
          </div>
        )}
        <Outlet />
      </main>
      <footer className="border-t border-slate-200 bg-white py-4 text-center text-sm text-slate-700">
        ShopEase - a demo store. Payments are simulated.
      </footer>
    </div>
  )
}
