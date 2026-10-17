import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null)
  const timer = useRef(null)

  const show = useCallback((message, type = 'success') => {
    clearTimeout(timer.current)
    setToast({ message, type, id: Date.now() })
    timer.current = setTimeout(() => setToast(null), 4000)
  }, [])

  const value = useMemo(() => ({ show }), [show])
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4" role="status" aria-live="polite">
        {toast && (
          <div
            data-testid="toast"
            className={`pointer-events-auto max-w-md rounded-md px-4 py-3 text-sm font-medium text-white shadow-lg ${
              toast.type === 'error' ? 'bg-red-700' : 'bg-green-700'
            }`}
          >
            {toast.message}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
