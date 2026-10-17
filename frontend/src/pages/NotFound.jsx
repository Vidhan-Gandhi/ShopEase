import { Link } from 'react-router-dom'
import { useTitle } from '../utils/hooks'

export default function NotFound() {
  useTitle('Page not found')
  return (
    <div data-testid="not-found" className="card mx-auto max-w-lg text-center">
      <h1>Page not found</h1>
      <p className="mt-2">The page you are looking for does not exist.</p>
      <Link to="/" data-testid="not-found-home" className="btn btn-primary mt-4">Go to home</Link>
    </div>
  )
}
