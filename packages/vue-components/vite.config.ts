import { defineConfig } from 'vite'
import { resolve } from 'path'
import vue from '@vitejs/plugin-vue'
import dts from 'vite-plugin-dts'
import { libInjectCss } from 'vite-plugin-lib-inject-css'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), libInjectCss(),dts({ include: ['src'] })],
  build: {
        lib: {
          entry: resolve(__dirname, 'src/main.ts'),
          formats: ['es']
        },
        copyPublicDir: false,
        rollupOptions: {
               external: ['vue'],
             }
      }
})