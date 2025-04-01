import cp from "child_process"
import fs from "fs"
import { EFFECT_APP_LIBS, packages } from "./shared.js"

const pj = (await import(process.cwd() + "/package.json", { with: { type: "json" } })).default

pj.resolutions = {
  ...pj.resolutions,
  "@effect-app/eslint-codegen-model": "file:" + EFFECT_APP_LIBS + "/packages/eslint-codegen-model",
  "effect-app": "file:" + EFFECT_APP_LIBS + "/packages/effect-app",
  "@effect-app/infra": "file:" + EFFECT_APP_LIBS + "/packages/infra",
  "@effect-app/vue": "file:" + EFFECT_APP_LIBS + "/packages/vue",
  "@effect-app/vue-components": "file:" + EFFECT_APP_LIBS + "/packages/vue-components",
  // TODO: with hard links why would this be needed?
  ...packages.reduce((acc, p) => ({ ...acc, [p]: `file:${EFFECT_APP_LIBS}/node_modules/${p}` }), {})
}

fs.writeFileSync("./package.json", JSON.stringify(pj, null, 2))

cp.execSync("pnpm i", { stdio: "inherit" })
