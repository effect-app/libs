/// <reference types="vitest" />
import { defineConfig } from "vite"
import vue from '@vitejs/plugin-vue'
import makeConfig from "../../vite.config.base"

export default defineConfig({
  ...makeConfig(__dirname),
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{js,ts,jsx,tsx}', '**/__tests__/**/*.test.{js,ts,jsx,tsx}'],
    exclude: ['node_modules/**', 'dist/**'],
    globals: true
  },
  optimizeDeps: {
    exclude: ['**/__tests__/**', '**/*.test.*']
  }
})
