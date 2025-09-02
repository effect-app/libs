/// <reference types="vitest" />
import { defineConfig } from "vitest/config"
import vue from '@vitejs/plugin-vue'
import makeConfig from "../../vite.config.base"

export default defineConfig({
  ...makeConfig(__dirname),
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}', '**/test/**/*.test.{ts,tsx}', '**/__tests__/**/*.test.{ts,tsx}'],
    exclude: ['node_modules/**', 'dist/**'],
    globals: true
  },
  optimizeDeps: {
    exclude: ['**/__tests__/**', '**/test/**', '**/*.test.*']
  }
})
