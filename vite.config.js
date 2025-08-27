import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  base: '/comp/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        list: resolve(__dirname, 'list.html'),
      },
    },
  },
})
