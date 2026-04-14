#!/usr/bin/env node

import { execSync } from "node:child_process"

execSync("pnpm effect-app-cli sync-effect", { stdio: "inherit" })
