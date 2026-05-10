import fs from "fs"

fs.readdirSync("./patches").filter((_) => _.slice(1).includes("@")).forEach((f) => {
  let [packageName_, maybeVersion, version] = f.replace(".patch", "").split("@")
  const packageName = (version ? ("@" + maybeVersion) : packageName_).split("__").join("/")
  version = version ?? maybeVersion
  const oldPatchFile = `./patches/${f}`
  const content = fs
    .readFileSync(oldPatchFile, "utf-8")
    .replaceAll(" a/", ` a/node_modules/${packageName}/`)
    .replaceAll(" b/", ` b/node_modules/${packageName}/`)
  const newPatchFile = `./patches/${packageName.replace("/", "+")}+${version}.patch`
  fs.writeFileSync(newPatchFile, content)

  fs.rmSync(oldPatchFile)
})
