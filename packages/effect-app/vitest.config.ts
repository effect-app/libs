/// <reference types="vitest" />
import { defineConfig } from "vitest/config"
import makeConfig from "../../vite.config.base"

export default defineConfig(makeConfig(__dirname))
