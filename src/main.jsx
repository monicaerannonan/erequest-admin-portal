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
      const isCtrlOrMeta = e.ctrlKey || e.metaKey

      // Block View Page Source (Ctrl+U / Cmd+U)
      if (isCtrlOrMeta && !e.shiftKey && !e.altKey && key === 'u') {
        e.preventDefault()
        e.stopPropagation()
        window.open('about:blank', '_blank')
        return
      }

      // Block DevTools / Inspect Element shortcuts:
      // F12, Ctrl+Shift+I/J/C/K (Windows/Linux), Cmd+Opt+I/J/C (macOS)
      const isF12 = e.key === 'F12' || e.keyCode === 123
      const isDevToolsCombo =
        (isCtrlOrMeta && e.shiftKey && ['i', 'j', 'c', 'k'].includes(key)) ||
        (e.metaKey && e.altKey && ['i', 'j', 'c', 'k'].includes(key))

      if (isF12 || isDevToolsCombo) {
        e.preventDefault()
        e.stopPropagation()
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
