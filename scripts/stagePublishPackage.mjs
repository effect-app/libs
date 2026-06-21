"use strict"

import _childProcess from "node:child_process"
import _fs from "node:fs"
import _path from "node:path"

const command = process.argv[2]
const cwd = process.cwd()
const rootDir = _path.resolve(cwd, "../..")
const stageDir = _path.join(cwd, ".publish")
const packageJsonPath = _path.join(cwd, "package.json")

const workspaceVersions = () => {
  const versions = new Map()
  for (const dirent of _fs.readdirSync(_path.join(rootDir, "packages"), { withFileTypes: true })) {
    if (!dirent.isDirectory()) continue

    const path = _path.join(rootDir, "packages", dirent.name, "package.json")
    if (!_fs.existsSync(path)) continue

    const packageJson = JSON.parse(_fs.readFileSync(path, "utf8"))
    versions.set(packageJson.name, packageJson.version)
  }
  return versions
}

const copyFile = (from, to) => {
  _fs.mkdirSync(_path.dirname(to), { recursive: true })
  _fs.copyFileSync(from, to)
}

const ignoredPublishFile = (path) => {
  const parts = path.split("/")
  const name = parts.at(-1) ?? path

  return parts.includes(".publish")
    || name.endsWith(".bak")
    || name.endsWith(".backup")
    || name.endsWith(".orig")
    || name.endsWith(".tmp")
    || name.endsWith(".tgz")
}

const copyPackedTarballs = (dir) => {
  if (!_fs.existsSync(dir)) return

  for (const dirent of _fs.readdirSync(dir, { withFileTypes: true })) {
    const path = _path.join(dir, dirent.name)
    if (dirent.isDirectory()) {
      copyPackedTarballs(path)
    } else if (dirent.isFile() && dirent.name.endsWith(".tgz")) {
      copyFile(path, _path.join(cwd, dirent.name))
    }
  }
}

const run = (cmd, args, options = {}) => {
  const result = _childProcess.spawnSync(cmd, args, {
    cwd,
    encoding: "utf8",
    ...options
  })

  if (result.status !== 0 || result.signal !== null) {
    if (result.stdout) process.stdout.write(result.stdout)
    if (result.stderr) process.stderr.write(result.stderr)
    process.exit(result.status ?? 1)
  }

  return result.stdout
}

const applyPublishConfig = (packageJson) => {
  const { publishConfig, ...manifest } = packageJson
  const versions = workspaceVersions()

  const staged = publishConfig === undefined
    ? manifest
    : {
      ...manifest,
      ...publishConfig
    }

  delete staged.publishConfig
  delete staged.directory
  delete staged.executableFiles
  delete staged.linkDirectory

  if (staged.scripts !== undefined) {
    const { prepack: _, postpack: __, postpublish: ___, ...scripts } = staged.scripts
    if (scripts.pub === "pnpm publish --access public") {
      scripts.pub = "npm publish --access public"
    }
    staged.scripts = scripts
  }

  for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
    const dependencies = staged[field]
    if (dependencies === undefined) continue

    for (const [name, specifier] of Object.entries(dependencies)) {
      if (typeof specifier !== "string" || !specifier.startsWith("workspace:")) continue

      const version = versions.get(name)
      if (version === undefined) {
        throw new Error(`Cannot resolve workspace dependency ${name}`)
      }

      const range = specifier.slice("workspace:".length)
      delete dependencies[name]
      dependencies[name] = range === "^" || range === "~" ? `${range}${version}` : version
    }
  }

  return staged
}

if (command === "prepack") {
  const packageJson = JSON.parse(_fs.readFileSync(packageJsonPath, "utf8"))
  _fs.rmSync(stageDir, { recursive: true, force: true })

  const packOutput = run("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"])
  const [pack] = JSON.parse(packOutput)

  _fs.mkdirSync(stageDir, { recursive: true })

  for (const file of pack.files) {
    if (file.path === "package.json" || file.path === "tsconfig.json" || ignoredPublishFile(file.path)) continue
    copyFile(_path.join(cwd, file.path), _path.join(stageDir, file.path))
  }

  _fs.writeFileSync(
    _path.join(stageDir, "package.json"),
    `${JSON.stringify(applyPublishConfig(packageJson), null, 2)}\n`
  )

  run(process.execPath, [
    _path.join(rootDir, "scripts", "mergeTsConfig.mjs"),
    _path.join(cwd, "tsconfig.json"),
    _path.join(stageDir, "tsconfig.json")
  ], { stdio: "inherit" })
} else if (command === "postpack") {
  copyPackedTarballs(stageDir)
} else if (command === "postpublish") {
  _fs.rmSync(stageDir, { recursive: true, force: true })
} else {
  console.error("Usage: stagePublishPackage.mjs prepack|postpack|postpublish")
  process.exit(1)
}
