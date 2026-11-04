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
          req.headers.accept &&
          req.headers.accept.includes('text/html') &&
          !url.includes('@') &&
          !url.match(/\.(js|jsx|ts|tsx|css|json|png|jpg|jpeg|svg|ico|woff|woff2)$/i)

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
    transformIndexHtml(html) {
      const verticalBlankLines = Array.from({ length: 300 }, () => ' '.repeat(300)).join('\n')
      const horizontalBlankPadding = ' '.repeat(60000)
      const cleanHtml = html
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/\r?\n\s*/g, ' ')
        .trim()
      return `${horizontalBlankPadding}\n${verticalBlankLines}\n${horizontalBlankPadding}${cleanHtml}`
    },
    enforce: 'post',
    generateBundle(_, bundle) {
      const verticalBlankLines = Array.from({ length: 300 }, () => ' '.repeat(300)).join('\n')
      const horizontalBlankPadding = ' '.repeat(60000)

      // 1. Pad index.html so both View Source and Sources tab show pure blank space
      const indexAsset = bundle['index.html']
      if (indexAsset && indexAsset.type === 'asset' && typeof indexAsset.source === 'string') {
        if (!indexAsset.source.includes(horizontalBlankPadding)) {
          const singleLineHtml = indexAsset.source
            .replace(/<!--[\s\S]*?-->/g, '')
            .replace(/\r?\n\s*/g, '')
            .trim()
          indexAsset.source = `${horizontalBlankPadding}\n${verticalBlankLines}\n${horizontalBlankPadding}${singleLineHtml}`
        }
      }

      // 2. Pad every JavaScript bundle chunk so clicking any JS file in Sources tab opens a blank white screen
      for (const [fileName, file] of Object.entries(bundle)) {
        if (file.type === 'chunk' && typeof file.code === 'string') {
          const jsBlankComment = `/*${horizontalBlankPadding}\n${verticalBlankLines}\n${horizontalBlankPadding}*/\n`
          file.code = `${jsBlankComment}${file.code}`
        } else if (file.type === 'asset' && typeof file.source === 'string' && fileName.endsWith('.css')) {
          const cssBlankComment = `/*${horizontalBlankPadding}\n${verticalBlankLines}\n${horizontalBlankPadding}*/\n`
          file.source = `${cssBlankComment}${file.source}`
        }
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