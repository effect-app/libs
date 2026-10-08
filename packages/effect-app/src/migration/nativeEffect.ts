/**
 * Rewrites source that imported effect-app helpers now provided by Effect.
 *
 * The rewrite is textual and keeps the rest of the file. It understands named
 * imports, aliases, and `import * as` namespaces from the effect-app entry points
 * listed in {@link nativeEffectReplacements}.
 */

export interface NativeEffectReplacement {
  readonly module: string
  readonly name: string
  /** Expression that replaces a reference to `name`. */
  readonly expression: string
  readonly note: string
  readonly imports: ReadonlyArray<readonly [local: string, from: string]>
  /** When set, a call `name(...args)` is rewritten instead of the bare identifier. */
  readonly call?: "date-add" | "date-sub" | "chunk"
}

const struct = [["Struct", "effect/Struct"]] as const
const record = [["Record", "effect/Record"]] as const
const str = [["String", "effect/String"]] as const
const option = [["Option", "effect/Option"]] as const
const array = [["Array", "effect/Array"]] as const
const chunk = [["Chunk", "effect/Chunk"]] as const
const tuple = [["Tuple", "effect/Tuple"]] as const
const effect = [["Effect", "effect/Effect"]] as const
const dateTime = [["DateTime", "effect/DateTime"], ["pipeZonedLocal", "effect-app/DateTime"]] as const
const deferred = [["Deferred", "effect/Deferred"]] as const
const result = [["Result", "effect/Result"]] as const
const absurd = [["absurd", "effect/Function"]] as const

export const nativeEffectReplacements: ReadonlyArray<NativeEffectReplacement> = [
  {
    module: "effect-app/utils",
    name: "typedKeysOf",
    expression: "Struct.keys",
    imports: struct,
    note: "Struct.keys returns `(keyof T & string)[]`."
  },
  {
    module: "effect-app/utils",
    name: "typedValuesOf",
    expression: "Record.values",
    imports: record,
    note:
      "Record.values reads a record with one value type. When each value's type depends on its key, use Object.values."
  },
  {
    module: "effect-app/utils",
    name: "capitalize",
    expression: "String.capitalize",
    imports: str,
    note: "Same first-character capitalization, including the empty string."
  },
  {
    module: "effect-app/utils",
    name: "uncapitalize",
    expression: "String.uncapitalize",
    imports: str,
    note: "Same first-character uncapitalization, including the empty string."
  },
  {
    module: "effect-app/utils",
    name: "assertUnreachable",
    expression: "absurd",
    imports: absurd,
    note: "absurd throws when an impossible value is reached. The error text no longer includes the value."
  },
  {
    module: "effect-app/Function",
    name: "tuple",
    expression: "Tuple.make",
    imports: tuple,
    note: "Tuple.make returns a mutable tuple. It is assignable wherever a readonly tuple was expected."
  },
  {
    module: "effect-app/Array",
    name: "toNonEmptyArray",
    expression: "Option.liftPredicate(Array.isReadonlyArrayNonEmpty)",
    imports: [...option, ...array],
    note: "Option of the same readonly array when it is non-empty."
  },
  {
    module: "effect-app/Array",
    name: "NEROArrayFromArray",
    expression: "Option.liftPredicate(Array.isReadonlyArrayNonEmpty)",
    imports: [...option, ...array],
    note: "Same as toNonEmptyArray."
  },
  {
    module: "effect-app/Array",
    name: "NEAFromArray",
    expression: "Option.liftPredicate(Array.isArrayNonEmpty)",
    imports: [...option, ...array],
    note: "Option of the same mutable array when it is non-empty."
  },
  {
    module: "effect-app/Array",
    name: "chunk_",
    expression: "Array.chunksOf",
    imports: [...array, ...chunk],
    call: "chunk",
    note: "Was a Chunk of mutable slices. Now a Chunk of Array.chunksOf groups. An empty input is an empty Chunk."
  },
  {
    module: "effect-app/Array",
    name: "_chunk_",
    expression: "Array.chunksOf",
    imports: array,
    note: "The generator form is gone. Array.chunksOf returns the groups directly."
  },
  {
    module: "effect-app/Option",
    name: "toBool",
    expression: "Option.isSome",
    imports: option,
    note: "isSome is the boolean test and also narrows to Some."
  },
  {
    module: "effect-app/Effect",
    name: "annotateLogscoped",
    expression: "Effect.annotateLogsScoped",
    imports: effect,
    note: "The old name was a typo of Effect.annotateLogsScoped."
  },
  {
    module: "effect-app/Effect",
    name: "await_",
    expression: "Deferred.await",
    imports: deferred,
    note: "Await a Deferred. Effect.await_ was Deferred.await."
  },
  {
    module: "effect-app/Chunk",
    name: "findFirstSimple",
    expression: "Chunk.findFirst",
    imports: chunk,
    note: "The alias passed the chunk first. Chunk.findFirst is dual, so the data-first call still typechecks."
  },
  {
    module: "effect-app/Chunk",
    name: "findLastSimple",
    expression: "Chunk.findLast",
    imports: chunk,
    note: "Alias of Chunk.findLast."
  },
  {
    module: "effect-app/Chunk",
    name: "ChunkPartition",
    expression: "Chunk.partition",
    imports: chunk,
    note: "Alias of Chunk.partition."
  },
  {
    module: "effect-app/Chunk",
    name: "uniq",
    expression:
      "(equivalence) => (self) => Chunk.fromIterable(Array.dedupeWith(Chunk.toReadonlyArray(self), equivalence))",
    imports: [...chunk, ...array],
    note: "Keeps the first match under a custom equivalence. Equal values can use Chunk.dedupe instead."
  },
  {
    module: "effect-app/Chunk",
    name: "elem",
    expression: "(equivalence, value) => Chunk.containsWith(equivalence)(value)",
    imports: chunk,
    note: "Equivalence is treated as symmetric. containsWith applies it as equivalence(needle, element)."
  },
  {
    module: "effect-app/Schema",
    name: "DateValid",
    expression: "Date",
    imports: [["Date", "effect-app/Schema"]],
    note: "DateValid was an alias of effect-app Schema.Date. Schema.Date already rejects invalid dates."
  },
  {
    module: "effect-app/_ext/misc",
    name: "encaseMaybeInEffect_",
    expression: "Effect.fromOption",
    imports: effect,
    note: "Effect.fromOption(option, onNone) fails with the lazy error on None."
  },
  {
    module: "effect-app/_ext/misc",
    name: "encaseMaybeEither_",
    expression: "Result.fromOption",
    imports: result,
    note: "Result.fromOption(option, onNone)."
  },
  {
    module: "effect-app/_ext/misc",
    name: "toNullable",
    expression: "(effect) => Effect.map(effect, Option.getOrNull)",
    imports: [...effect, ...option],
    note: "Maps a successful Option to its value or null."
  },
  {
    module: "effect-app/_ext/misc",
    name: "flatMapScoped",
    expression: "(scoped, f) => Effect.scoped(Effect.flatMap(scoped, f))",
    imports: effect,
    note: "Closes the scope after the continuation."
  },
  {
    module: "effect-app/_ext/misc",
    name: "scope",
    expression: "(scoped, effect) => Effect.scoped(Effect.andThen(scoped, effect))",
    imports: effect,
    note: "Runs the second effect inside the first effect's scope, then closes it."
  },
  ...([
    ["DateAddDays", "days", "date-add"],
    ["DateAddHours", "hours", "date-add"],
    ["DateAddMinutes", "minutes", "date-add"],
    ["DateAddSeconds", "seconds", "date-add"],
    ["DateAddWeeks", "weeks", "date-add"],
    ["DateAddMonths", "months", "date-add"],
    ["DateAddYears", "years", "date-add"],
    ["DateSubDays", "days", "date-sub"],
    ["DateSubHours", "hours", "date-sub"],
    ["DateSubMinutes", "minutes", "date-sub"],
    ["DateSubSeconds", "seconds", "date-sub"],
    ["DateSubWeeks", "weeks", "date-sub"],
    ["DateSubMonths", "months", "date-sub"],
    ["DateSubYears", "years", "date-sub"]
  ] as const)
    .map(([name, unit, call]): NativeEffectReplacement => ({
      module: "effect-app/_ext/date",
      name,
      expression: unit,
      imports: dateTime,
      call,
      note:
        "pipeZonedLocal attaches the process timezone, runs DateTime.add or DateTime.subtract, and returns the instant with toDateUtc."
    }))
]

interface Binding {
  readonly replacement: NativeEffectReplacement
  readonly local: string
}

const byModule = new Map<string, Map<string, NativeEffectReplacement>>()
for (const replacement of nativeEffectReplacements) {
  const existing = byModule.get(replacement.module) ?? new Map<string, NativeEffectReplacement>()
  existing.set(replacement.name, replacement)
  byModule.set(replacement.module, existing)
}

const moduleNames = new Set(byModule.keys())

interface Rendered {
  readonly text: string
  readonly end: number
}

/** Rewrite one source file. `source` is the file text. */
export const migrateEffectAppSource = (source: string): string => {
  const imports = findImports(source)
  const bindings = new Map<string, Binding>()
  const namespaceBindings = new Map<string, ReadonlyMap<string, NativeEffectReplacement>>()
  const edits: Array<{ start: number; end: number; text: string }> = []
  const needed = new Map<string, Set<string>>()
  const maskedSpans: Array<{ start: number; end: number }> = []

  for (const statement of imports) {
    const table = byModule.get(statement.module)
    if (table === undefined) continue
    maskedSpans.push({ start: statement.start, end: statement.end })

    if (statement.namespace !== undefined) {
      namespaceBindings.set(statement.namespace, table)
      continue
    }

    const removed: Array<Specifier> = []
    for (const specifier of statement.specifiers) {
      const replacement = table.get(specifier.imported)
      if (replacement === undefined) continue
      bindings.set(specifier.local, { replacement, local: specifier.local })
      removed.push(specifier)
      rememberImports(needed, replacement)
    }
    if (removed.length === 0) continue
    if (removed.length === statement.specifiers.length) {
      edits.push({ start: statement.start, end: statement.end, text: "" })
    } else {
      const kept = statement.specifiers.filter((specifier) => !removed.includes(specifier))
      edits.push({
        start: statement.clauseStart,
        end: statement.clauseEnd,
        text: `{ ${kept.map((specifier) => specifier.text).join(", ")} }`
      })
    }
  }

  const mask = maskSpans(maskNonCode(source), maskedSpans)

  for (const [local, binding] of bindings) {
    for (const match of identifierSpans(mask, local)) {
      const rendered = render(binding.replacement, source, match + local.length)
      edits.push({ start: match, end: rendered.end, text: rendered.text })
    }
  }

  for (const [namespace, table] of namespaceBindings) {
    let used = false
    for (const match of identifierSpans(mask, namespace)) {
      const after = skipSpaces(source, match + namespace.length)
      if (source[after] !== ".") continue
      const propertyStart = after + 1
      const property = readIdentifier(source, propertyStart)
      if (property === undefined) continue
      const replacement = table.get(property.name)
      if (replacement === undefined) {
        used = true
        continue
      }
      rememberImports(needed, replacement)
      const rendered = render(replacement, source, propertyStart + property.name.length)
      edits.push({ start: match, end: rendered.end, text: rendered.text })
    }
    if (!used) {
      const statement = imports.find((item) => item.namespace === namespace && byModule.has(item.module))
      if (statement !== undefined) edits.push({ start: statement.start, end: statement.end, text: "" })
    }
  }

  return insertImports(applyEdits(source, edits), needed)
}

const render = (replacement: NativeEffectReplacement, source: string, afterName: number): Rendered => {
  const bare = { text: replacement.expression, end: afterName }
  if (replacement.call === undefined) return bare
  const open = skipSpaces(source, afterName)
  if (source[open] !== "(") return bare
  const args = splitArgs(source, open)
  if (args === undefined) return bare
  if (replacement.call === "chunk" && args.args.length === 2) {
    return {
      text: `Chunk.fromIterable(Array.chunksOf(${args.args[0]}, ${args.args[1]}))`,
      end: args.end
    }
  }
  if ((replacement.call === "date-add" || replacement.call === "date-sub") && args.args.length === 2) {
    const method = replacement.call === "date-add" ? "add" : "subtract"
    return {
      text: `pipeZonedLocal(${args.args[0]}, DateTime.${method}({ ${replacement.expression}: ${args.args[1]} }))`,
      end: args.end
    }
  }
  return bare
}

const rememberImports = (needed: Map<string, Set<string>>, replacement: NativeEffectReplacement) => {
  for (const [local, from] of replacement.imports) {
    const names = needed.get(from) ?? new Set<string>()
    names.add(local)
    needed.set(from, names)
  }
}

interface Specifier {
  readonly imported: string
  readonly local: string
  readonly text: string
}

interface ImportStatement {
  readonly start: number
  readonly end: number
  readonly clauseStart: number
  readonly clauseEnd: number
  readonly module: string
  readonly namespace?: string
  readonly specifiers: ReadonlyArray<Specifier>
}

const findImports = (source: string): ReadonlyArray<ImportStatement> => {
  const found: Array<ImportStatement> = []
  const pattern = /\bimport\s+(type\s+)?([\s\S]*?)\s+from\s+["']([^"']+)["']/g
  for (const match of source.matchAll(pattern)) {
    const clause = match[2] ?? ""
    const moduleName = match[3] ?? ""
    if (!moduleNames.has(moduleName)) continue
    const start = lineStart(source, match.index ?? 0)
    const end = lineEnd(source, (match.index ?? 0) + match[0].length)
    const clauseStart = (match.index ?? 0) + match[0].indexOf(clause)
    const namespace = /^\*\s+as\s+([A-Za-z_$][\w$]*)/.exec(clause.trim())
    found.push({
      start,
      end,
      clauseStart,
      clauseEnd: clauseStart + clause.length,
      module: moduleName,
      ...(namespace?.[1] === undefined ? {} : { namespace: namespace[1] }),
      specifiers: namespace === null ? parseSpecifiers(clause) : []
    })
  }
  return found
}

const parseSpecifiers = (clause: string): ReadonlyArray<Specifier> => {
  const brace = clause.indexOf("{")
  if (brace < 0) return []
  const end = clause.lastIndexOf("}")
  const body = clause.slice(brace + 1, end)
  return body.split(",").flatMap((part) => {
    const text = part.trim()
    if (text === "" || text.startsWith("type ")) return []
    const alias = /^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/.exec(text)
    if (alias === null) return []
    return [{ imported: alias[1]!, local: alias[2] ?? alias[1]!, text }]
  })
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const identifierSpans = (mask: string, name: string): ReadonlyArray<number> => {
  const spans: Array<number> = []
  const pattern = new RegExp(`(?<![\\w$])${escapeRegExp(name)}(?![\\w$])`, "g")
  for (const match of mask.matchAll(pattern)) spans.push(match.index ?? 0)
  return spans
}

const readIdentifier = (source: string, index: number): { readonly name: string } | undefined => {
  const match = /^[A-Za-z_$][\w$]*/.exec(source.slice(index))
  return match === null ? undefined : { name: match[0] }
}

const splitArgs = (
  source: string,
  open: number
): { readonly args: ReadonlyArray<string>; readonly end: number } | undefined => {
  const balanced = readBalanced(source, open, "(", ")")
  if (balanced === undefined) return undefined
  const args: Array<string> = []
  let depth = 0
  let quote: "'" | "\"" | "`" | undefined
  let start = 0
  const body = balanced.body
  for (let i = 0; i < body.length; i++) {
    const char = body[i]
    if (quote !== undefined) {
      if (char === "\\") {
        i++
        continue
      }
      if (char === quote) quote = undefined
      continue
    }
    if (char === "'" || char === "\"" || char === "`") {
      quote = char
      continue
    }
    if (char === "(" || char === "[" || char === "{") depth++
    if (char === ")" || char === "]" || char === "}") depth--
    if (char === "," && depth === 0) {
      args.push(body.slice(start, i).trim())
      start = i + 1
    }
  }
  const last = body.slice(start).trim()
  if (last !== "") args.push(last)
  return { args, end: balanced.end }
}

const readBalanced = (
  source: string,
  open: number,
  left: string,
  right: string
): { readonly body: string; readonly end: number } | undefined => {
  if (source[open] !== left) return undefined
  let depth = 0
  let quote: "'" | "\"" | "`" | undefined
  for (let i = open; i < source.length; i++) {
    const char = source[i]
    if (quote !== undefined) {
      if (char === "\\") {
        i++
        continue
      }
      if (char === quote) quote = undefined
      continue
    }
    if (char === "'" || char === "\"" || char === "`") {
      quote = char
      continue
    }
    if (char === left) depth++
    if (char === right) {
      depth--
      if (depth === 0) return { body: source.slice(open + 1, i), end: i + 1 }
    }
  }
  return undefined
}

const maskSpans = (mask: string, spans: ReadonlyArray<{ start: number; end: number }>): string => {
  const chars = [...mask]
  for (const span of spans) {
    for (let i = span.start; i < span.end && i < chars.length; i++) {
      if (chars[i] !== "\n") chars[i] = " "
    }
  }
  return chars.join("")
}

const skipSpaces = (source: string, index: number): number => {
  let i = index
  while (i < source.length && (source[i] === " " || source[i] === "\n" || source[i] === "\t")) i++
  return i
}

const lineStart = (source: string, index: number): number => {
  const start = source.lastIndexOf("\n", index - 1)
  return start < 0 ? 0 : start + 1
}

const lineEnd = (source: string, index: number): number => {
  const end = source.indexOf("\n", index)
  return end < 0 ? source.length : end + 1
}

const applyEdits = (source: string, edits: ReadonlyArray<{ start: number; end: number; text: string }>): string => {
  const ordered = [...edits].sort((a, b) => b.start - a.start)
  let next = source
  for (const edit of ordered) next = next.slice(0, edit.start) + edit.text + next.slice(edit.end)
  return next
}

const insertImports = (source: string, needed: ReadonlyMap<string, Set<string>>): string => {
  const lines: Array<string> = []
  for (const [from, names] of needed) {
    for (const name of names) {
      if (hasImport(source, name, from)) continue
      lines.push(
        namedImportNames.has(name)
          ? `import { ${name} } from "${from}"`
          : `import * as ${name} from "${from}"`
      )
    }
  }
  if (lines.length === 0) return source.replace(/^\n+/, "")
  const lastImport = lastImportEnd(source)
  const block = `${lines.sort().join("\n")}\n`
  if (lastImport === 0) return `${block}${source.replace(/^\n+/, "")}`
  return `${source.slice(0, lastImport)}${block}${source.slice(lastImport)}`.replace(/^\n+/, "")
}

const namedImportNames = new Set(["absurd", "Date", "pipeZonedLocal"])

const hasImport = (source: string, name: string, from: string): boolean => {
  const fromPattern = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const namespace = new RegExp(`import\\s+\\*\\s+as\\s+${name}\\s+from\\s+["']${fromPattern}["']`)
  const named = new RegExp(`import\\s+(type\\s+)?\\{[^}]*\\b${name}\\b[^}]*}\\s+from\\s+["']${fromPattern}["']`)
  const barrel = name === name[0]?.toUpperCase()
    ? new RegExp(`import\\s+(type\\s+)?\\{[^}]*\\b${name}\\b[^}]*}\\s+from\\s+["']effect["']`)
    : undefined
  return namespace.test(source) || named.test(source) || barrel?.test(source) === true
}

const lastImportEnd = (source: string): number => {
  const pattern = /\bimport\s+(type\s+)?[\s\S]*?\s+from\s+["'][^"']+["']/g
  let end = 0
  for (const match of source.matchAll(pattern)) {
    end = lineEnd(source, (match.index ?? 0) + match[0].length)
  }
  return end
}

const maskNonCode = (source: string): string => {
  const chars = [...source]
  let i = 0
  const blank = (from: number, to: number) => {
    for (let j = from; j < to; j++) {
      if (chars[j] !== "\n") chars[j] = " "
    }
  }
  while (i < source.length) {
    const two = source.slice(i, i + 2)
    if (two === "//") {
      const end = source.indexOf("\n", i)
      blank(i, end < 0 ? source.length : end)
      i = end < 0 ? source.length : end
      continue
    }
    if (two === "/*") {
      const end = source.indexOf("*/", i + 2)
      const stop = end < 0 ? source.length : end + 2
      blank(i, stop)
      i = stop
      continue
    }
    const char = source[i]
    if (char === "'" || char === "\"") {
      const stop = scanQuoted(source, i, char)
      blank(i, stop)
      i = stop
      continue
    }
    if (char === "`") {
      const stop = scanTemplate(source, i)
      blank(i, stop)
      i = stop
      continue
    }
    i++
  }
  return chars.join("")
}

const scanQuoted = (source: string, start: number, quote: "'" | "\""): number => {
  for (let i = start + 1; i < source.length; i++) {
    if (source[i] === "\\") {
      i++
      continue
    }
    if (source[i] === quote) return i + 1
  }
  return source.length
}

const scanTemplate = (source: string, start: number): number => {
  for (let i = start + 1; i < source.length; i++) {
    if (source[i] === "\\") {
      i++
      continue
    }
    if (source[i] === "`") return i + 1
    if (source.slice(i, i + 2) === "${") {
      let depth = 1
      i += 2
      while (i < source.length && depth > 0) {
        if (source[i] === "{") depth++
        else if (source[i] === "}") depth--
        i++
      }
      i--
    }
  }
  return source.length
}
