import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function blankViewSourcePlugin() {
  let lastHeartbeatAt = 0
  let allowNextLoadUntil = Date.now() + 5000

  return {
    name: 'blank-view-source-plugin',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url || ''

        if (url.startsWith('/__view_source_guard')) {
          if (url.includes('action=unload')) {
            lastHeartbeatAt = 0
            allowNextLoadUntil = Date.now() + 5000
          } else if (url.includes('action=active')) {
            lastHeartbeatAt = Date.now()
          }
          res.statusCode = 204
          res.end()
          return
        }

        const isHtmlNavigation =
          req.method === 'GET' &&
          (url === '/' || url.startsWith('/?') || url.startsWith('/index.html')) &&
          req.headers.accept &&
          req.headers.accept.includes('text/html')

        if (isHtmlNavigation) {
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
          const now = Date.now()
          const clientIsActive = now - lastHeartbeatAt < 4500
          const isReloading = now < allowNextLoadUntil

          if (clientIsActive && !isReloading) {
            res.statusCode = 200
            res.setHeader('Content-Type', 'text/html; charset=utf-8')
            res.end('')
            return
          }

          // Consume the reload allowance once used
          allowNextLoadUntil = 0
        }

        next()
      })
    },
    enforce: 'post',
    generateBundle(_, bundle) {
      const indexAsset = bundle['index.html']
      if (indexAsset && indexAsset.type === 'asset' && typeof indexAsset.source === 'string') {
        const singleLineHtml = indexAsset.source
          .replace(/<!--[\s\S]*?-->/g, '')
          .replace(/\r?\n\s*/g, '')
          .trim()
        const verticalBlankLines = Array.from({ length: 300 }, () => ' '.repeat(300)).join('\n')
        const horizontalBlankPadding = ' '.repeat(60000)
        indexAsset.source = `${horizontalBlankPadding}\n${verticalBlankLines}\n${horizontalBlankPadding}${singleLineHtml}`
      }
    },
  }
}

export default defineConfig(({ command, mode }) => ({
  plugins: [react(), blankViewSourcePlugin()],
  base: command === 'build' || mode === 'production' ? '/erequest-admin-portal/' : '/',
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('@firebase/firestore') || id.includes('firebase/firestore')) {
              return 'vendor-firebase-firestore'
            }
            if (id.includes('firebase') || id.includes('@firebase')) {
              return 'vendor-firebase-core'
            }
            if (
              id.includes('react-router') ||
              id.includes('@remix-run') ||
              id.includes('react-dom') ||
              id.includes('react') ||
              id.includes('scheduler')
            ) {
              return 'vendor-react'
            }
          }
        },
      },
    },
  },
}))