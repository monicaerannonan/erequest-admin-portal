import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

if (typeof window !== 'undefined') {
  // Console Security Notice (Enterprise defense-in-depth, like Google/Facebook/Discord)
  if (!import.meta.env.DEV) {
    const bannerStyleTitle =
      'color: #ef4444; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 2.2rem; font-weight: 800; -webkit-text-stroke: 1px #991b1b;'
    const bannerStyleText =
      'color: #334155; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 1.05rem; line-height: 1.6; font-weight: 500;'

    console.log('%cSTOP! Access Warning', bannerStyleTitle)
    console.log(
      '%cThis browser feature is intended for authorized developers only.\n' +
        'Source code is minified with sourcemaps disabled.\n' +
        'Database records are protected by client-side AES-256-GCM encryption and server-side Cloud Firestore Security Rules.',
      bannerStyleText
    )
  }

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
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
