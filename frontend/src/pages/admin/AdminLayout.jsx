import { NavLink, Outlet } from 'react-router-dom'

const cls = ({ isActive }) =>
  `inline-flex min-h-10 items-center rounded-md px-3 py-2 text-sm font-medium ${isActive ? 'bg-blue-700 text-white' : 'bg-white text-slate-900 border border-slate-300 hover:bg-slate-100'}`

export default function AdminLayout() {
  return (
    <div>
      <nav aria-label="Admin" data-testid="admin-nav" className="mb-5 flex flex-wrap gap-2">
        <NavLink to="/admin" end data-testid="admin-nav-dashboard" className={cls}>Dashboard</NavLink>
        <NavLink to="/admin/products" data-testid="admin-nav-products" className={cls}>Products</NavLink>
        <NavLink to="/admin/categories" data-testid="admin-nav-categories" className={cls}>Categories</NavLink>
        <NavLink to="/admin/orders" data-testid="admin-nav-orders" className={cls}>Orders</NavLink>
      </nav>
      <Outlet />
    </div>
  )
}
