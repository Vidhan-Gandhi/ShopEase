import { Route, Routes } from 'react-router-dom'
import Guard from './components/Guard'
import Layout from './components/Layout'
import { AuthProvider } from './context/AuthContext'
import { CartProvider } from './context/CartContext'
import { ToastProvider } from './context/ToastContext'
import Addresses from './pages/Addresses'
import Cart from './pages/Cart'
import ChangePassword from './pages/ChangePassword'
import Checkout from './pages/Checkout'
import Home from './pages/Home'
import Login from './pages/Login'
import NotFound from './pages/NotFound'
import OrderDetail from './pages/OrderDetail'
import Orders from './pages/Orders'
import ProductDetail from './pages/ProductDetail'
import Products from './pages/Products'
import Profile from './pages/Profile'
import Signup from './pages/Signup'
import VerifyEmail from './pages/VerifyEmail'
import AdminCategories from './pages/admin/AdminCategories'
import AdminLayout from './pages/admin/AdminLayout'
import AdminOrderDetail from './pages/admin/AdminOrderDetail'
import AdminOrders from './pages/admin/AdminOrders'
import AdminProducts from './pages/admin/AdminProducts'
import Dashboard from './pages/admin/Dashboard'
import ProductForm from './pages/admin/ProductForm'

export default function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <ToastProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Home />} />
              <Route path="products" element={<Products />} />
              <Route path="products/:id" element={<ProductDetail />} />
              <Route path="cart" element={<Cart />} />
              <Route path="login" element={<Login />} />
              <Route path="signup" element={<Signup />} />
              <Route path="verify-email" element={<VerifyEmail />} />

              <Route path="profile" element={<Guard><Profile /></Guard>} />
              <Route path="profile/password" element={<Guard><ChangePassword /></Guard>} />
              <Route path="profile/addresses" element={<Guard role="customer"><Addresses /></Guard>} />
              <Route path="checkout" element={<Guard role="customer"><Checkout /></Guard>} />
              <Route path="order-confirmation/:id" element={<Guard role="customer"><OrderDetail confirmation /></Guard>} />
              <Route path="orders" element={<Guard role="customer"><Orders /></Guard>} />
              <Route path="orders/:id" element={<Guard role="customer"><OrderDetail /></Guard>} />

              <Route path="admin" element={<Guard role="admin"><AdminLayout /></Guard>}>
                <Route index element={<Dashboard />} />
                <Route path="products" element={<AdminProducts />} />
                <Route path="products/new" element={<ProductForm />} />
                <Route path="products/:id/edit" element={<ProductForm />} />
                <Route path="categories" element={<AdminCategories />} />
                <Route path="orders" element={<AdminOrders />} />
                <Route path="orders/:id" element={<AdminOrderDetail />} />
              </Route>

              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </ToastProvider>
      </CartProvider>
    </AuthProvider>
  )
}
