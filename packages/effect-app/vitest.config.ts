/// <reference types="vitest" />
import { defineConfig } from "vitest/config"
import makeConfig from "../../vite.config.base"

const config = makeConfig(__dirname)
export default defineConfig({ ...config, test: { ...config.test, exclude: ["node_modules/**", "**/dist/**"], } })
