import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      'react': path.resolve(import.meta.dirname, 'node_modules/react'),
      'react-dom': path.resolve(import.meta.dirname, 'node_modules/react-dom'),
    },
  },
  build: {
    lib: {
      entry: path.resolve(import.meta.dirname, 'src/mountProfile.tsx'),
      name: 'LibraryAuth',
      fileName: () => 'library-auth.js',
      formats: ['es'],
    },
    outDir: 'dist',
    emptyOutDir: false,
  },
  define: {
    'process.env.NODE_ENV': '"production"',
  },
})

