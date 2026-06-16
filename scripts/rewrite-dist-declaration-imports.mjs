import { readdir, readFile, stat, writeFile } from "node:fs/promises"
import { join } from "node:path"

const args = process.argv.slice(2)
const roots = args.length > 0 ? args : ["packages"]
const declarationFile = /\.d\.[cm]?ts$/
const relativeTsSpecifier = /(["'])(\.\.?\/[^"']+)\.ts\1/g

async function* walk(path) {
  const info = await stat(path).catch(() => undefined)
  if (!info) {
    return
  }
  if (info.isFile()) {
    yield path
    return
  }
  if (!info.isDirectory()) {
    return
  }
  for (const entry of await readdir(path)) {
    yield* walk(join(path, entry))
  }
}

for (const root of roots) {
  for await (const file of walk(root)) {
    if (!declarationFile.test(file)) {
      continue
    }
    const content = await readFile(file, "utf8")
    const rewritten = content.replace(relativeTsSpecifier, '$1$2.js$1')
    if (rewritten !== content) {
      await writeFile(file, rewritten)
    }
  }
}
