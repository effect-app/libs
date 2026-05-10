const { readFileSync, writeFileSync } = require("fs")

const file = process.argv[2]
const root = JSON.parse(readFileSync(file, "utf-8"))

const sorted = Object
  .keys(root)
  .sort((a, b) => a.localeCompare(b))
  .reduce((acc, key) => ({
    ...acc,
    [key]: root[key].sort((a, b) => {
      const aIsType = a.definitionKind === "type" || a.definitionKind === "interface"
      const bIsType = b.definitionKind === "type" || b.definitionKind === "interface"

      if (aIsType !== bIsType) {
        if (aIsType) return -1
        return 1
      }

      const aIsUpperCase = a.definitionName[0].toUpperCase() === a.definitionName[0]
      const bIsUpperCase = b.definitionName[0].toUpperCase() === b.definitionName[0]

      if (aIsUpperCase !== bIsUpperCase) {
        if (aIsUpperCase) return -1
        return 1
      }
      return a.definitionName.localeCompare(b.definitionName)
    })
  }), {})

writeFileSync(file, JSON.stringify(sorted, undefined, 2), "utf-8")
