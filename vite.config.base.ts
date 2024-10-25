/// <reference types="vitest" />
import path from "path"
import fs from "fs"
import AutoImport from "unplugin-auto-import/vite"
import { defineConfig } from "vitest/config"

// const autoImport = AutoImport({
//   dts: "./test/auto-imports.d.ts",
//   // include: [
//   //   /\.test\.[tj]sx?$/ // .ts, .tsx, .js, .jsx
//   // ],
//   imports: [
//     "vitest"
//   ]
// })

export default function makeConfig(dirName?: string) {
  const prefix = path.resolve(__dirname, "packages")
  const packages = fs.readdirSync(prefix).map(f => prefix + "/" + f).filter(f => fs.lstatSync(f).isDirectory() )
  const cfg = {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    //plugins: [autoImport],
    test: {
      include:  ["./test/**/*.test.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
      reporters: "verbose",
      globals: true
    },
    resolve: {
      alias: packages.map(pkg => ({ pkg, json: pkg + "/package.json"})).filter(_ => fs.existsSync(_.json)).reduce((acc, { pkg, json}) => { 
      acc[JSON.parse(fs.readFileSync(json, "utf-8")).name] = path.resolve(pkg, 
        // workaround Prelude "export *" from namespaces hack
        pkg.endsWith("effect-app") ? "dist" : "src")
      return acc
    }, { }) // "effect-app/Prelude": path.join(__dirname, "packages/core/src/Prelude.code.ts")
  }
  }
  console.log(cfg)
  return cfg
}
