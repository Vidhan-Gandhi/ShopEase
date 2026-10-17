import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const cls = ({ isActive }) =>
  `inline-flex min-h-10 items-center rounded-md px-3 py-2 text-sm font-medium ${isActive ? 'bg-blue-700 text-white' : 'bg-white text-slate-900 border border-slate-300 hover:bg-slate-100'}`

export default function AccountNav() {
  const { user } = useAuth()
  return (
    <nav aria-label="Account" data-testid="account-nav" className="mb-4 flex flex-wrap gap-2">
      <NavLink to="/profile" end data-testid="account-nav-profile" className={cls}>My profile</NavLink>
      {user?.role === 'customer' && (
        <NavLink to="/profile/addresses" data-testid="account-nav-addresses" className={cls}>Addresses</NavLink>
      )}
      <NavLink to="/profile/password" data-testid="account-nav-password" className={cls}>Change password</NavLink>
    </nav>
  )
}
