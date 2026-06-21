"use strict"

import _json from "json5"
import _childProcess from "node:child_process"
import _fs from "node:fs"
import _path from "node:path"

const command = process.argv[2]
const cwd = process.cwd()
const rootDir = _path.resolve(cwd, "../..")
const packageJsonPath = _path.join(cwd, "package.json")
const packageJson = JSON.parse(_fs.readFileSync(packageJsonPath, "utf8"))
const backupDir = _path.join(rootDir, "node_modules", ".cache", "effect-app-publish-tsconfig")
const backupPath = _path.join(backupDir, `${encodeURIComponent(packageJson.name)}.json`)
const configPath = _path.join(cwd, "tsconfig.json")

if (command === "prepack") {
  const config = _json.parse(_fs.readFileSync(configPath, "utf8"))
  if (config.extends === undefined) {
    console.error(`Refusing to pack ${packageJson.name}: tsconfig.json is already flattened`)
    process.exit(1)
  }

  _fs.mkdirSync(backupDir, { recursive: true })
  _fs.copyFileSync(configPath, backupPath)

  const result = _childProcess.spawnSync(process.execPath, [
    _path.join(rootDir, "scripts", "mergeTsConfig.mjs"),
    configPath
  ], { stdio: "inherit" })

  if (result.status !== 0 || result.signal !== null) {
    _fs.copyFileSync(backupPath, configPath)
    _fs.rmSync(backupPath, { force: true })
    process.exit(result.status ?? 1)
  }
} else if (command === "postpack") {
  if (!_fs.existsSync(backupPath)) {
    console.error(`Missing tsconfig backup for ${packageJson.name}`)
    process.exit(1)
  }

  _fs.copyFileSync(backupPath, configPath)
  _fs.rmSync(backupPath, { force: true })
  _fs.rmSync(_path.join(cwd, "tsplus.config.json"), { force: true })
} else {
  console.error("Usage: publishTsConfig.mjs prepack|postpack")
  process.exit(1)
}
