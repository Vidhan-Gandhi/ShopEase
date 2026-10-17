import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { adminApi, catalogApi } from '../../api'
import { ErrorState, Field, FormError, Loading } from '../../components/ui'
import { useFetch, useTitle } from '../../utils/hooks'
import { hasErrors, parseMoney, vRange } from '../../utils/validators'

const EMPTY = { name: '', description: '', price: '', discountedPrice: '', category: '', stock: '0', images: '', featured: false }

function isHttpUrl(s) {
  if (s.length > 2048 || !/^https?:\/\//i.test(s)) return false
  try {
    new URL(s)
    return true
  } catch {
    return false
  }
}

function validate(v) {
  const errs = {}
  errs.name = vRange(v.name, 'Name', 2, 120)
  const d = v.description.trim()
  errs.description = !d ? 'Description is required' : d.length > 2000 ? 'Description must be at most 2000 characters' : ''
  const price = parseMoney(v.price, 'Price')
  errs.price = price.error || ''
  const disc = parseMoney(v.discountedPrice, 'Discounted price', { required: false })
  errs.discountedPrice = disc.error || ''
  if (!errs.price && !errs.discountedPrice && disc.value !== null && disc.value >= price.value) {
    errs.discountedPrice = 'Discounted price must be less than price'
  }
  errs.category = v.category ? '' : 'Category is required'
  errs.stock = /^\d+$/.test(v.stock.trim()) && Number(v.stock) <= 100000 ? '' : 'Stock must be a whole number between 0 and 100000'
  const urls = v.images.split('\n').map((s) => s.trim()).filter(Boolean)
  if (urls.length === 0) errs.images = 'At least one image URL is required'
  else if (urls.length > 8) errs.images = 'At most 8 images are allowed'
  else {
    const bad = urls.findIndex((u) => !isHttpUrl(u))
    errs.images = bad >= 0 ? `Image ${bad + 1} must be a valid http or https URL` : ''
  }
  return { errs, price: price.value, discountedPrice: disc.value, urls }
}

export default function ProductForm() {
  const { id } = useParams()
  const editing = !!id
  useTitle(editing ? 'Edit product' : 'Add product')
  const navigate = useNavigate()
  const cats = useFetch(() => catalogApi.categories(), [])
  const existing = useFetch(() => (editing ? adminApi.product(id) : Promise.resolve(null)), [id])
  const [values, setValues] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const p = existing.data?.product
    if (p) {
      setValues({
        name: p.name,
        description: p.description,
        price: String(p.price),
        discountedPrice: p.discountedPrice === null ? '' : String(p.discountedPrice),
        category: p.category?.id || '',
        stock: String(p.stock),
        images: (p.images || []).join('\n'),
        featured: !!p.featured,
      })
    }
  }, [existing.data])

  const set = (k) => (e) => setValues((v) => ({ ...v, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setFormError('')
    const { errs, price, discountedPrice, urls } = validate(values)
    setErrors(errs)
    if (hasErrors(errs)) return
    const body = {
      name: values.name.trim(),
      description: values.description.trim(),
      price,
      discountedPrice,
      category: values.category,
      stock: Number(values.stock),
      images: urls,
      featured: values.featured,
    }
    setBusy(true)
    try {
      if (editing) await adminApi.updateProduct(id, body)
      else await adminApi.createProduct(body)
      navigate('/admin/products')
    } catch (err) {
      setBusy(false)
      const f = { ...err.fields }
      // images.N -> single message on the images field
      for (const k of Object.keys(f)) {
        if (k.startsWith('images.')) {
          f.images = f.images || `Image ${Number(k.split('.')[1]) + 1}: ${f[k]}`
          delete f[k]
        }
      }
      if (Object.keys(f).length) setErrors(f)
      else setFormError(err.message)
    }
  }

  if (editing && existing.loading) return <Loading testid="product-form-loading" />
  if (editing && existing.error) {
    if (existing.error.status === 404) {
      return (
        <div data-testid="product-form-not-found" className="card mx-auto max-w-lg text-center">
          <h1>Product not found</h1>
          <Link to="/admin/products" data-testid="product-form-back" className="btn btn-primary mt-4">Back to products</Link>
        </div>
      )
    }
    return <ErrorState testid="product-form-error" error={existing.error} onRetry={existing.reload} />
  }
  if (cats.error) return <ErrorState testid="product-form-categories-error" error={cats.error} onRetry={cats.reload} />

  return (
    <div className="mx-auto max-w-2xl">
      <h1 data-testid="product-form-title">{editing ? 'Edit product' : 'Add product'}</h1>
      <form data-testid="product-form" onSubmit={submit} noValidate className="card mt-4 space-y-4">
        <FormError message={formError} testid="product-form-error-message" />
        <Field id="pf-name" testid="product-form-name" label="Name" value={values.name} onChange={set('name')} error={errors.name} />
        <Field id="pf-description" testid="product-form-description" as="textarea" rows={4} label="Description" value={values.description} onChange={set('description')} error={errors.description} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="pf-price" testid="product-form-price" label="Price (₹)" inputMode="decimal" value={values.price} onChange={set('price')} error={errors.price} />
          <Field id="pf-discounted" testid="product-form-discounted-price" label="Discounted price (₹, optional)" inputMode="decimal" value={values.discountedPrice} onChange={set('discountedPrice')} error={errors.discountedPrice} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="pf-category" testid="product-form-category" as="select" label="Category" value={values.category} onChange={set('category')} error={errors.category}>
            <option value="">Select a category</option>
            {cats.data?.items.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Field>
          <Field id="pf-stock" testid="product-form-stock" label="Stock" inputMode="numeric" value={values.stock} onChange={set('stock')} error={errors.stock} />
        </div>
        <Field id="pf-images" testid="product-form-images" as="textarea" rows={4} label="Image URLs (one per line, 1 to 8)" value={values.images} onChange={set('images')} error={errors.images} hint="Each URL must start with http:// or https://" />
        <label className="flex min-h-10 items-center gap-2 text-sm">
          <input type="checkbox" data-testid="product-form-featured" checked={values.featured} onChange={set('featured')} className="h-5 w-5" />
          Featured on the home page
        </label>
        <div className="flex flex-wrap gap-3">
          <button type="submit" data-testid="product-form-submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving...' : editing ? 'Save changes' : 'Create product'}
          </button>
          <Link to="/admin/products" data-testid="product-form-cancel" className="btn btn-secondary">Cancel</Link>
        </div>
      </form>
    </div>
  )
}
