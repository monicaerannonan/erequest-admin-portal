import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command, mode }) => ({
  plugins: [react()],
  base: command === 'build' || mode === 'production' ? '/erequest-admin-portal/' : '/',
  build: {
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