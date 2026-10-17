import { useEffect, useRef } from 'react'

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Modal confirmation. Esc, Cancel and a click outside close it; focus is trapped inside. */
export default function ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel }) {
  const ref = useRef(null)

  useEffect(() => {
    const previous = document.activeElement
    const node = ref.current
    const first = node.querySelector('[data-testid="confirm-dialog-cancel"]')
    if (first) first.focus()
    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      } else if (e.key === 'Tab') {
        const els = node.querySelectorAll(FOCUSABLE)
        if (!els.length) return
        const a = els[0]
        const z = els[els.length - 1]
        if (e.shiftKey && document.activeElement === a) {
          e.preventDefault()
          z.focus()
        } else if (!e.shiftKey && document.activeElement === z) {
          e.preventDefault()
          a.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      if (previous && previous.focus) previous.focus()
    }
  }, [onCancel])

  return (
    <div
      data-testid="confirm-dialog-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        data-testid="confirm-dialog"
        className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
      >
        <h2 id="confirm-dialog-title" data-testid="confirm-dialog-title">{title}</h2>
        <p id="confirm-dialog-message" data-testid="confirm-dialog-message" className="mt-2 text-slate-700">{message}</p>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button type="button" data-testid="confirm-dialog-cancel" className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" data-testid="confirm-dialog-confirm" className="btn btn-danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
