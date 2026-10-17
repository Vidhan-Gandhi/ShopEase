import { Link, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTitle } from '../utils/hooks'
import { ErrorState, Loading } from './ui'

export function NotAuthorised() {
  useTitle('Not authorised')
  return (
    <div data-testid="not-authorised" className="card mx-auto max-w-lg text-center">
      <h1 data-testid="not-authorised-title">Not authorised</h1>
      <p className="mt-2">You do not have permission to view this page.</p>
      <Link to="/" data-testid="not-authorised-home" className="btn btn-primary mt-4">Go to home</Link>
    </div>
  )
}

export function AdminBlocked() {
  useTitle('Customers only')
  return (
    <div data-testid="admin-blocked" className="card mx-auto max-w-lg text-center">
      <h1 data-testid="admin-blocked-title">Admin accounts cannot place orders</h1>
      <p className="mt-2">Shopping, cart and order pages are for customer accounts.</p>
      <Link to="/admin" data-testid="admin-blocked-dashboard" className="btn btn-primary mt-4">Go to admin dashboard</Link>
    </div>
  )
}

/** role: 'customer' (customers only), 'admin' (admin only) or undefined (any logged-in user). */
export default function Guard({ role, children }) {
  const { user, status, bootError, bootstrap, sessionNotice } = useAuth()
  const loc = useLocation()
  if (status === 'loading') return <Loading testid="auth-loading" />
  if (status === 'error') return <ErrorState testid="auth-error" error={bootError} onRetry={bootstrap} />
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search, message: sessionNotice || undefined }} />
  if (role === 'admin' && user.role !== 'admin') return <NotAuthorised />
  if (role === 'customer' && user.role === 'admin') return <AdminBlocked />
  return children
}
