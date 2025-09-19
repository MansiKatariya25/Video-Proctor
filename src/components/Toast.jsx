import { ToastContainer, toast as _toast } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'

export function ToastHost() {
  return (
    <ToastContainer
      position="top-right"
      autoClose={3000}
      hideProgressBar={false}
      newestOnTop
      closeOnClick
      rtl={false}
      pauseOnFocusLoss
      draggable
      pauseOnHover
      theme="colored"
    />
  )
}

export function toast({ type='info', title, message, ttl=3000 }) {
  const text = [title, message].filter(Boolean).join(' — ')
  switch ((type||'').toLowerCase()) {
    case 'success': _toast.success(text, { autoClose: ttl }); break
    case 'error': _toast.error(text, { autoClose: ttl }); break
    case 'warning': _toast.warning(text, { autoClose: ttl }); break
    default: _toast.info(text, { autoClose: ttl }); break
  }
}
