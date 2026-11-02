import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

if (typeof window !== 'undefined') {
  if (import.meta.env.DEV) {
    const notifyActive = () => {
      fetch('/__view_source_guard?action=active', {
        method: 'POST',
        keepalive: true,
      }).catch(() => {})
    }

    const notifyUnload = () => {
      try {
        if (navigator.sendBeacon) {
          navigator.sendBeacon('/__view_source_guard?action=unload', '1')
        }
        const xhr = new XMLHttpRequest()
        xhr.open('POST', '/__view_source_guard?action=unload', false)
        xhr.send(null)
      } catch {
        // Ignore network errors during unload
      }
    }

    notifyActive()
    setInterval(notifyActive, 2000)
    window.addEventListener('beforeunload', notifyUnload)
    window.addEventListener('pagehide', notifyUnload)
  }

  window.addEventListener(
    'contextmenu',
    (e) => {
      e.preventDefault()
    },
    true
  )

  window.addEventListener(
    'keydown',
    (e) => {
      const key = (e.key || '').toLowerCase()
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && key === 'u') {
        e.preventDefault()
        e.stopPropagation()
        window.open('about:blank', '_blank')
      }
    },
    true
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
