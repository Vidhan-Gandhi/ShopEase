import { useCallback, useEffect, useState } from 'react'

export function useTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} | ShopEase` : 'ShopEase'
  }, [title])
}

/** Runs fn() when deps change; exposes loading / error / data and reload(). */
export function useFetch(fn, deps) {
  const [state, setState] = useState({ data: null, loading: true, error: null })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let cancelled = false
    setState((s) => ({ ...s, loading: true, error: null }))
    fn()
      .then((data) => !cancelled && setState({ data, loading: false, error: null }))
      .catch((error) => !cancelled && setState({ data: null, loading: false, error }))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])
  const reload = useCallback(() => setTick((t) => t + 1), [])
  const setData = useCallback((data) => setState((s) => ({ ...s, data })), [])
  return { ...state, reload, setData }
}
