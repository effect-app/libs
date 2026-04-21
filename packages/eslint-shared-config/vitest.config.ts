/// <reference types="vitest" />
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["test/**/*.test.{ts,mts}"],
    testTimeout: 30_000
  }
})
