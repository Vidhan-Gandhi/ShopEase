import { useState } from 'react'
import { Link } from 'react-router-dom'

export function Loading({ testid = 'loading', label = 'Loading...' }) {
  return (
    <div data-testid={testid} role="status" className="flex items-center justify-center gap-3 py-12 text-slate-700">
      <span className="h-6 w-6 animate-spin rounded-full border-4 border-slate-300 border-t-blue-700" aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}

export function ErrorState({ error, onRetry, testid = 'error' }) {
  const message = typeof error === 'string' ? error : error?.message || 'Something went wrong. Please try again later.'
  return (
    <div data-testid={testid} role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-900">
      <p data-testid={`${testid}-message`} className="font-medium">{message}</p>
      {onRetry && (
        <button type="button" data-testid={`${testid}-retry`} onClick={onRetry} className="btn btn-secondary mt-3">
          Retry
        </button>
      )}
    </div>
  )
}

export function EmptyState({ testid = 'empty', message, children }) {
  return (
    <div data-testid={testid} className="card py-10 text-center">
      <p data-testid={`${testid}-message`} className="text-lg font-medium text-slate-800">{message}</p>
      {children && <div className="mt-4">{children}</div>}
    </div>
  )
}

export function FormError({ message, testid }) {
  if (!message) return null
  return (
    <div data-testid={testid} role="alert" className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
      {message}
    </div>
  )
}

export function FormSuccess({ message, testid }) {
  if (!message) return null
  return (
    <div data-testid={testid} role="status" className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900">
      {message}
    </div>
  )
}

/** Labelled input / select / textarea with an error message tied to it. */
export function Field({ id, label, error, testid, hint, as: Tag = 'input', children, ...props }) {
  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(' ') || undefined
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-800">{label}</label>
      <Tag
        id={id}
        data-testid={testid}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={describedBy}
        className={`input ${error ? 'input-error' : ''}`}
        {...props}
      >
        {children}
      </Tag>
      {hint && <p id={`${id}-hint`} className="mt-1 text-xs text-slate-600">{hint}</p>}
      {error && (
        <p id={`${id}-error`} data-testid={`${testid}-error`} role="alert" className="mt-1 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}

export function Pagination({ page, totalPages, onChange, testid = 'pagination' }) {
  if (!totalPages || totalPages <= 1) return null
  const pages = []
  const start = Math.max(1, Math.min(page - 2, totalPages - 4))
  const end = Math.min(totalPages, start + 4)
  for (let p = start; p <= end; p++) pages.push(p)
  return (
    <nav aria-label="Pagination" data-testid={testid} className="mt-6 flex flex-wrap items-center justify-center gap-2">
      <button type="button" data-testid={`${testid}-prev`} className="btn btn-secondary" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Previous
      </button>
      {pages.map((p) => (
        <button
          key={p}
          type="button"
          data-testid={`${testid}-page-${p}`}
          aria-current={p === page ? 'page' : undefined}
          className={`btn ${p === page ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => onChange(p)}
        >
          {p}
        </button>
      ))}
      <button type="button" data-testid={`${testid}-next`} className="btn btn-secondary" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        Next
      </button>
    </nav>
  )
}

const STATUS_COLORS = {
  Placed: 'bg-blue-100 text-blue-900',
  Confirmed: 'bg-indigo-100 text-indigo-900',
  Shipped: 'bg-amber-100 text-amber-900',
  Delivered: 'bg-green-100 text-green-900',
  Cancelled: 'bg-red-100 text-red-900',
}

export function StatusBadge({ status, testid }) {
  return (
    <span data-testid={testid} className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLORS[status] || 'bg-slate-100 text-slate-900'}`}>
      {status}
    </span>
  )
}

const PLACEHOLDER =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect width="400" height="400" fill="#e2e8f0"/><text x="200" y="210" font-family="Arial" font-size="24" text-anchor="middle" fill="#475569">No image</text></svg>',
  )

export function ProductImage({ src, alt, className = '', testid }) {
  const [failed, setFailed] = useState(false)
  return (
    <img
      src={failed || !src ? PLACEHOLDER : src}
      alt={alt}
      loading="lazy"
      data-testid={testid}
      onError={() => setFailed(true)}
      className={`bg-slate-100 object-cover ${className}`}
    />
  )
}

export function NoticeList({ notices, testid = 'notices', onDismiss }) {
  if (!notices || !notices.length) return null
  return (
    <div data-testid={testid} role="status" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      <ul className="list-disc space-y-1 pl-5">
        {notices.map((n, i) => (
          <li key={i} data-testid={`${testid}-item`}>{n}</li>
        ))}
      </ul>
      {onDismiss && (
        <button type="button" data-testid={`${testid}-dismiss`} className="btn btn-secondary mt-2" onClick={onDismiss}>
          Dismiss
        </button>
      )}
    </div>
  )
}

export function BackLink({ to, children, testid }) {
  return (
    <Link to={to} data-testid={testid} className="link inline-block py-2">
      {children}
    </Link>
  )
}
