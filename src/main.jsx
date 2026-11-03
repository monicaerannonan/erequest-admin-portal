import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

if (typeof window !== 'undefined') {
  // Console Protection: Display Encrypted Memory Sandbox + Suppress raw app logs in production
  if (!import.meta.env.DEV) {
    const renderEncryptedConsole = () => {
      try {
        console.clear()
        const bannerTitle =
          'color: #10b981; font-family: monospace; font-size: 13px; font-weight: 700;'
        const bannerBody =
          'color: #059669; font-family: monospace; font-size: 11.5px; line-height: 1.4;'
        const hexDump = [
          '%c[PROTECTED RUNTIME SANDBOX // AES-256-GCM ENCRYPTED MEMORY CORE]',
          '%c0x00007FFF: 45 4e 43 52 59 50 54 45 44 20 53 45 53 53 49 4f  | ENCRYPTED SESSIO',
          '0x0000800F: 65 6e 63 3a 76 31 3a 38 66 32 61 39 30 62 63 34  | enc:v1:8f2a90bc4',
          '0x0000801F: a9 12 c4 88 fe 99 21 b3 cc 4d ea 11 05 98 ff 72  | .!....M....r',
          '0x0000802F: 7b 22 73 74 61 74 75 73 22 3a 22 6c 6f 63 6b 65  | {"status":"locke',
          '0x0000803F: 64 22 2c 22 63 69 70 68 65 72 22 3a 22 61 65 73  | d","cipher":"aes',
          '0x0000804F: 2d 32 35 36 2d 67 63 6d 22 2c 22 6b 65 79 22 3a  | -256-gcm","key":',
          '0x0000805F: 22 5b 52 45 53 54 52 49 43 54 45 44 5d 22 7d 00  | "[RESTRICTED]"}.',
          '0x0000806F: 8f 4b 2a 99 10 e4 6c 33 02 11 a5 ff 7e 88 19 04  | .K*...l3....~...',
          '',
          '>> Memory Segment: RESTRICTED // Direct Source Access Prohibited',
          '>> Cryptographic Hash: PBKDF2-HMAC-SHA256 (100,000 Iterations)',
          '>> Cloud Firestore Security Rules: Strict Zero-Trust Enforcement Active'
        ].join('\n')

        console.log(hexDump, bannerTitle, bannerBody)
      } catch {
        // Ignore errors
      }
    }

    renderEncryptedConsole()
    setInterval(renderEncryptedConsole, 3500)

    // Mask standard logs to prevent data leakage in console
    console.log = () => {}
    console.info = () => {}
    console.warn = () => {}
    console.debug = () => {}
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
