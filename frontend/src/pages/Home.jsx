import { Link } from 'react-router-dom'
import { catalogApi } from '../api'
import ProductCard from '../components/ProductCard'
import { EmptyState, ErrorState, Loading } from '../components/ui'
import { useFetch, useTitle } from '../utils/hooks'

export default function Home() {
  useTitle('Home')
  const { data, loading, error, reload } = useFetch(
    async () => {
      const [featured, categories] = await Promise.all([catalogApi.featured(), catalogApi.categories()])
      return { featured: featured.items, categories: categories.items }
    },
    [],
  )

  return (
    <div className="space-y-8">
      <section className="rounded-lg bg-blue-700 p-6 text-white sm:p-10">
        <h1 data-testid="home-title">Welcome to ShopEase</h1>
        <p className="mt-2 max-w-xl">Shop electronics, fashion, books, home and sports essentials. Free delivery on orders of ₹499 and above.</p>
        <Link to="/products" data-testid="home-shop-now" className="btn mt-4 bg-white text-blue-800 hover:bg-slate-100">Shop all products</Link>
      </section>

      {loading && <Loading testid="home-loading" />}
      {error && <ErrorState testid="home-error" error={error} onRetry={reload} />}

      {data && (
        <>
          <section aria-labelledby="home-categories-title">
            <h2 id="home-categories-title">Shop by category</h2>
            {data.categories.length === 0 ? (
              <p data-testid="home-categories-empty" className="mt-3 text-slate-700">No categories yet</p>
            ) : (
              <ul data-testid="home-categories" className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {data.categories.map((c) => (
                  <li key={c.id} data-testid="home-category">
                    <Link to={`/products?category=${c.id}`} data-testid="home-category-link" className="card flex min-h-16 flex-col justify-center text-center hover:bg-blue-50">
                      <span data-testid="home-category-name" className="font-semibold">{c.name}</span>
                      <span className="text-xs text-slate-600">{c.productCount} products</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="home-featured-title">
            <h2 id="home-featured-title">Featured products</h2>
            {data.featured.length === 0 ? (
              <div className="mt-3"><EmptyState testid="home-featured-empty" message="No featured products yet" /></div>
            ) : (
              <ul data-testid="home-featured-list" className="mt-3 grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-4">
                {data.featured.map((p) => (
                  <ProductCard key={p.id} product={p} prefix="home" />
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}
