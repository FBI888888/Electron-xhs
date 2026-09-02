import { X } from 'lucide-react'
import { useToastStore } from '@renderer/store/app-store'

export const ToastViewport = () => {
  const messages = useToastStore((state) => state.messages)
  const dismiss = useToastStore((state) => state.dismiss)

  return (
    <div className="toast-viewport" aria-live="polite">
      {messages.map((toast) => (
        <div className={`toast toast--${toast.kind}`} key={toast.id}>
          <div>
            <strong>{toast.title}</strong>
            <p>{toast.message}</p>
          </div>
          <button aria-label="关闭" onClick={() => dismiss(toast.id)}>
            <X size={15} />
          </button>
        </div>
      ))}
    </div>
  )
}