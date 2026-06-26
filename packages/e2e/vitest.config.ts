/// <reference types="vitest" />
import { defineConfig } from "vitest/config"
import makeConfig from "../../vite.config.base"

export default defineConfig({
  ...makeConfig(__dirname),
  test: {
    environment: "node",
    include: ["**/test/**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", "dist/**"],
    globals: true
  }
})
