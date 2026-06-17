/**
 * Type-checker-backed resolver for the `model` preset's `static` mode.
 *
 * The text-only codegen emits `interface Encoded extends StructNestedEncoded<typeof X>`
 * — a conditional type that TypeScript re-resolves on first property access, once per
 * checker. For large schema trees that is a major instantiation cost (and, under the
 * parallel checker pool, a depth-limit trigger). This resolver instead emits the
 * *expanded* literal `Encoded` (and optionally `Type`) interface, with nested model
 * fields referenced by name (`Item.Encoded`), which TypeScript resolves once and reuses.
 *
 * It uses the classic `typescript` Compiler API (loaded lazily) so the package's
 * text-only path (oxlint rule) never needs a type checker. Only the CLI builds a program.
 */
import { createRequire } from "node:module"
import * as path from "node:path"

const require_ = createRequire(import.meta.url)

// `typescript` is an optional peer; only required for static mode (CLI).
type TS = typeof import("typescript")
type Type = import("typescript").Type
type Symbol_ = import("typescript").Symbol
type Node = import("typescript").Node
type TypeChecker = import("typescript").TypeChecker
type Program = import("typescript").Program

export interface ResolveOptions {
  /** Also emit a static `Type` interface (decoded side), enabling `S.OpaqueType<X.Type, X.Encoded>`. */
  readonly type?: boolean
  /** Also emit a static `Make` interface (make-input side), enabling `S.OpaqueShape<X.Type, X.Encoded, X.Make>`. Implies `type`. */
  readonly make?: boolean
  /** Emit a shallow public `Schema` facade and top-level instance interface. Implies `type` and `make`. */
  readonly facade?: boolean
}

export interface ModelTypeResolver {
  /**
   * Generate the `export namespace X { export interface Encoded {...} }` blocks for the
   * given models in `filename`. Returns the joined block body, or `null` when the file
   * is not part of the program / a model can't be resolved.
   */
  generate(filename: string, modelNames: ReadonlyArray<string>, options: ResolveOptions): string | null
}

let tsModule: TS | undefined
function loadTs(): TS {
  if (!tsModule) {
    try {
      tsModule = require_("typescript") as TS
    } catch {
      throw new Error("static model codegen requires the `typescript` package to be installed")
    }
  }
  return tsModule
}

function parseTsConfig(
  ts: TS,
  tsconfigPath: string
): { options: import("typescript").CompilerOptions; fileNames: Array<string> } {
  const read = ts.readConfigFile(tsconfigPath, ts.sys.readFile)
  if (read.error) {
    throw new Error(
      `Failed to read tsconfig ${tsconfigPath}: ${ts.flattenDiagnosticMessageText(read.error.messageText, "\n")}`
    )
  }
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, path.dirname(tsconfigPath))
  return {
    options: {
      ...parsed.options,
      noEmit: true,
      composite: false,
      incremental: false,
      skipLibCheck: true,
      declaration: false
    },
    fileNames: parsed.fileNames
  }
}

export function createModelTypeResolver(args: {
  readonly tsconfigPath: string
  /** Extra files to include as program roots (the files being codegen'd). */
  readonly files?: ReadonlyArray<string>
}): ModelTypeResolver {
  const ts = loadTs()
  const { fileNames, options } = parseTsConfig(ts, args.tsconfigPath)
  const roots = Array.from(new Set([...fileNames, ...(args.files ?? [])].map((f) => path.resolve(f))))

  let program: Program | undefined
  let checker: TypeChecker | undefined
  const getProgram = () => {
    if (!program) {
      program = ts.createProgram(roots, options)
      checker = program.getTypeChecker()
    }
    return { program: program!, checker: checker! }
  }

  return {
    generate(filename, modelNames, opts) {
      const { program, checker } = getProgram()
      const sf = program.getSourceFile(path.resolve(filename))
      if (!sf) return null

      const wanted = new Set(modelNames)
      // Name identifier of the schema that backs each model. The private `_X`
      // (class `class _X extends S.Opaque(...)` OR const `const _X = S.Struct(...)`,
      // the base-mode form) holds the real schema; the exported facade
      // `X extends OpaqueFacade<X, X.Encoded, ...>` / `extends __X` is
      // self-referential and can't resolve `Encoded`/`Type`/`Make`. Prefer `_X`.
      const schemaByName = new Map<string, import("typescript").Node>()
      const privateNames = new Set<string>()
      const consider = (text: string, nameNode: import("typescript").Node) => {
        if (text.startsWith("_") && !text.startsWith("__") && wanted.has(text.slice(1))) {
          schemaByName.set(text.slice(1), nameNode)
          privateNames.add(text.slice(1))
        } else if (wanted.has(text) && !privateNames.has(text)) {
          schemaByName.set(text, nameNode)
        }
      }
      sf.forEachChild((n) => {
        if (ts.isClassDeclaration(n) && n.name) consider(n.name.text, n.name)
        else if (ts.isVariableStatement(n)) {
          for (const d of n.declarationList.declarations) {
            if (ts.isIdentifier(d.name)) consider(d.name.text, d.name)
          }
        }
      })
      if (schemaByName.size === 0) return null

      const printer = makePrinter(ts, checker, wanted)
      const blocks: Array<string> = []
      const facadeType = (body: string) =>
        body.replace(/\.Type\b/g, "").replace(/\n    /g, "\n  ").replace(/\n  }$/, "\n}")
      for (const name of modelNames) {
        const nameNode = schemaByName.get(name)
        if (!nameNode) return null
        const sym = checker.getSymbolAtLocation(nameNode)
        if (!sym) return null
        const schemaType = checker.getTypeOfSymbolAtLocation(sym, nameNode)
        const encoded = printer.member(schemaType, "Encoded", nameNode)
        if (encoded === null) return null
        const emitType = opts.facade || opts.type || opts.make
        const emitMake = opts.facade || opts.make
        const lines = opts.facade
          ? []
          : [`export namespace ${name} {`, `  export interface Encoded ${encoded}`]
        if (emitType) {
          const typ = printer.member(schemaType, "Type", nameNode)
          if (typ === null) return null
          if (opts.facade) {
            // Note: instance getters/methods are already included by `member(...)`
            // above — an Opaque/Class `Self` is the class instance type, so the
            // checker reports getters as properties of `Type`. No re-attach needed.
            lines.push(`export interface ${name} ${facadeType(typ)}`)
            lines.push(`export namespace ${name} {`)
            lines.push(`  export interface Encoded ${encoded}`)
          } else {
            lines.push(`  export interface Type ${typ}`)
          }
        }
        if (emitMake) {
          const mk = printer.makeMember(schemaType, nameNode)
          if (mk === null) return null
          // A leading `= ` marks a type-alias emission (e.g. `{...} | void`, which
          // an interface can't express); otherwise it's an interface body.
          lines.push(mk.startsWith("=") ? `  export type Make ${mk}` : `  export interface Make ${mk}`)
        }
        if (opts.facade) {
          const decodingServices = printer.serviceMember(schemaType, "DecodingServices", nameNode)
          const encodingServices = printer.serviceMember(schemaType, "EncodingServices", nameNode)
          if (decodingServices === null || encodingServices === null) return null
          lines.push(`  export type DecodingServices = ${decodingServices}`)
          lines.push(`  export type EncodingServices = ${encodingServices}`)
        }
        lines.push("}")
        blocks.push(lines.join("\n"))
      }
      return blocks.join("\n")
    }
  }
}

function makePrinter(ts: TS, checker: TypeChecker, modelNames: ReadonlySet<string>) {
  // Note: deliberately NOT using `InTypeAlias` — that flag expands the alias being
  // printed (turning `NonEmptyString255` into `string & ...Brand`). Without it,
  // typeToString prefers the named alias symbol when one exists.
  const FF = ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseFullyQualifiedType

  // If `t` is a model's `Encoded` namespace interface -> "Name.Encoded".
  function modelEncodedName(t: Type): string | null {
    const sym = (t.aliasSymbol ?? t.symbol) as Symbol_ | undefined
    if (!sym || sym.name !== "Encoded") return null
    const parent = (sym as Symbol_ & { parent?: Symbol_ }).parent
    if (parent && modelNames.has(parent.name)) return `${parent.name}.Encoded`
    return null
  }

  // If `t` is a model's instance type -> "Name.Type". Two shapes occur:
  //  - Self = the class (before/without the self-rewrite): symbol name === ModelName.
  //  - Self = `X.Type` (after the self-rewrite): symbol is the `Type` interface,
  //    name === "Type", parent === ModelName.
  function modelTypeName(t: Type): string | null {
    const sym = (t.aliasSymbol ?? t.symbol) as (Symbol_ & { parent?: Symbol_ }) | undefined
    if (!sym) return null
    if (sym.name === "Type" && sym.parent && modelNames.has(sym.parent.name)) return `${sym.parent.name}.Type`
    if (modelNames.has(sym.name)) return `${sym.name}.Type`
    return null
  }

  // An anonymous object literal type (inline struct), as opposed to a named
  // interface/class (Date, branded scalars, library types) which we keep by name.
  function isAnonymousObject(t: Type): boolean {
    if ((t.flags & ts.TypeFlags.Object) === 0) return false
    if ((t as import("typescript").ObjectType).objectFlags & ts.ObjectFlags.Anonymous) {
      const sym = t.symbol as Symbol_ | undefined
      // TypeLiteral / ObjectLiteral symbols are inline; a named interface is not.
      return !sym || (sym.flags & (ts.SymbolFlags.TypeLiteral | ts.SymbolFlags.ObjectLiteral)) !== 0
    }
    return false
  }

  // Wrap a printed element in parens when used as an array/tuple element and it
  // contains a top-level union/intersection (precedence).
  function asElement(s: string): string {
    // Parenthesize unions/intersections AND `readonly`-prefixed elements (nested
    // arrays/tuples) so `ReadonlyArray<readonly [..]>` prints as
    // `readonly (readonly [..])[]`, not the invalid `readonly readonly [..][]`.
    return /[|&]/.test(s) || s.startsWith("readonly ") ? `(${s})` : s
  }

  function print(t: Type, atNode: Node, side: "Encoded" | "Type"): string {
    if (side === "Encoded") {
      const mn = modelEncodedName(t)
      if (mn) return mn
    } else {
      const mn = modelTypeName(t)
      if (mn) return mn
    }
    // union
    if (t.isUnion()) return t.types.map((x) => print(x, atNode, side)).join(" | ")
    // tuple (e.g. NonEmptyArray -> readonly [E, ...(E)[]])
    if (checker.isTupleType(t)) {
      const target = (t as import("typescript").TupleTypeReference).target
      const args = checker.getTypeArguments(t as import("typescript").TypeReference)
      const parts = args.map((a, i) => {
        const flag = target.elementFlags[i]!
        const isRest = (flag & ts.ElementFlags.Rest) !== 0
        const isOpt = (flag & ts.ElementFlags.Optional) !== 0
        const el = print(a, atNode, side)
        return isRest ? `...${asElement(el)}[]` : `${el}${isOpt ? "?" : ""}`
      })
      return `readonly [${parts.join(", ")}]`
    }
    // array
    if (checker.isArrayType(t)) {
      const el = print(checker.getTypeArguments(t as import("typescript").TypeReference)[0]!, atNode, side)
      return `readonly ${asElement(el)}[]`
    }
    // anonymous inline object -> expand structurally; named objects (Date, etc.) by name
    if (isAnonymousObject(t)) {
      const props = t.getProperties()
      if (props.length > 0) {
        const parts = props.map((p) => {
          const pt = checker.getTypeOfSymbolAtLocation(p, atNode)
          const opt = (p.flags & ts.SymbolFlags.Optional) !== 0 ? "?" : ""
          return `readonly ${propKey(p.name)}${opt}: ${print(pt, atNode, side)}`
        })
        return `{ ${parts.join("; ")} }`
      }
    }
    // primitives, literals, branded scalars, named library types, etc.
    const printed = checker.typeToString(t, atNode, FF)
    // On the Type side a branded scalar prints as `string & Ns.FooBrand`; prefer the
    // schema's companion type alias `Ns.Foo` (nominal, cheaper, what authors wrote).
    if (side === "Type") return namedScalar(printed)
    return printed
  }

  // `<base> & <Qualified>Brand` -> `<Qualified>` (the schema's companion scalar type).
  function namedScalar(s: string): string {
    const m = /^[\w.[\]"'| ]+ & ([\w.$]+)Brand$/.exec(s)
    return m ? m[1]! : s
  }

  return {
    /**
     * Non-static instance getters/methods declared on the model class body. They
     * live on the runtime `_X` (inherited by the facade `X`) but are not schema
     * fields, so they must be re-attached to the generated `Self` interface.
     */
    instanceMembers(cls: import("typescript").ClassDeclaration): Array<string> {
      const out: Array<string> = []
      for (const m of cls.members) {
        const isStatic = (ts.getCombinedModifierFlags(m) & ts.ModifierFlags.Static) !== 0
        if (isStatic || !m.name || !ts.isIdentifier(m.name)) continue
        const memberName = m.name.text
        if (ts.isGetAccessorDeclaration(m)) {
          const t = checker.getTypeAtLocation(m)
          out.push(`readonly ${memberName}: ${checker.typeToString(t, m, FF)}`)
        } else if (ts.isMethodDeclaration(m)) {
          const t = checker.getTypeAtLocation(m)
          out.push(`readonly ${memberName}: ${checker.typeToString(t, m, FF)}`)
        }
      }
      return out
    },

    /** Expand the top-level `Encoded`/`Type` interface of `schemaType` one level, nested by name. */
    member(schemaType: Type, key: "Encoded" | "Type", atNode: Node): string | null {
      const memberSym = checker.getPropertyOfType(schemaType, key)
      if (!memberSym) return null
      const memberType = checker.getTypeOfSymbolAtLocation(memberSym, atNode)
      const props = memberType.getProperties()
      if (props.length === 0) {
        // Not an expandable object (e.g. opaque already); fall back to a printed reference.
        return `extends ${checker.typeToString(memberType, atNode, FF)} {}`
      }
      const body = props
        .map((p) => {
          const pt = checker.getTypeOfSymbolAtLocation(p, atNode)
          const opt = (p.flags & ts.SymbolFlags.Optional) !== 0 ? "?" : ""
          return `    readonly ${propKey(p.name)}${opt}: ${print(pt, atNode, key)}`
        })
        .join("\n")
      return `{\n${body}\n  }`
    },

    /**
     * Expand the `make`-input interface (`~type.make.in`). Keys + optionality come from the
     * make-input member (so defaulted fields and `_tag` are optional); each value is the
     * Type-side shape with nested model refs rewritten `.Type` -> `.Make`.
     */
    makeMember(schemaType: Type, atNode: Node): string | null {
      const makeSym = checker.getPropertyOfType(schemaType, "~type.make.in")
      const typeSym = checker.getPropertyOfType(schemaType, "Type")
      if (!makeSym || !typeSym) return null
      const rawMakeType = checker.getTypeOfSymbolAtLocation(makeSym, atNode)
      const typeType = checker.getTypeOfSymbolAtLocation(typeSym, atNode)
      // `withConstructorDefault` makes the make-input `void | { ...all optional }`.
      // The `void` is NOT cosmetic: effect-app's `make`/`makeEffect` key off it to
      // make the input argument optional (a no-arg call). So we must preserve it.
      // A union has no own properties and `interface Make extends void | {...}` is a
      // syntax error, so when `void`/`undefined` is present we emit a TYPE ALIAS
      // (`export type Make = { ... } | void`) — signalled by a leading `= `.
      const isVoidish = (t: Type) => (t.flags & (ts.TypeFlags.Void | ts.TypeFlags.Undefined)) !== 0
      const hasVoid = rawMakeType.isUnion() && rawMakeType.types.some(isVoidish)
      const makeType = rawMakeType.isUnion()
        ? (rawMakeType.types.find((t) => t.getProperties().length > 0) ?? rawMakeType)
        : rawMakeType
      const makeProps = makeType.getProperties()
      if (makeProps.length === 0) {
        const printed = checker.typeToString(rawMakeType, atNode, FF)
        return `= ${printed}`
      }
      const typeByName = new Map(typeType.getProperties().map((p) => [p.name, p] as const))
      const body = makeProps
        .map((p) => {
          const opt = (p.flags & ts.SymbolFlags.Optional) !== 0 ? "?" : ""
          const source = typeByName.get(p.name) ?? p
          const printed = print(checker.getTypeOfSymbolAtLocation(source, atNode), atNode, "Type")
          // nested model `Foo.Type` becomes `Foo.Make`; scalars / Date / primitives untouched.
          const value = printed.replace(/\.Type\b/g, ".Make")
          return `    readonly ${propKey(p.name)}${opt}: ${value}`
        })
        .join("\n")
      // Leading `= ` marks a type-alias emission (model.ts emits `export type Make = ...`).
      return hasVoid ? `= {\n${body}\n  } | void` : `{\n${body}\n  }`
    },

    serviceMember(schemaType: Type, key: "DecodingServices" | "EncodingServices", atNode: Node): string | null {
      const memberSym = checker.getPropertyOfType(schemaType, key)
      if (!memberSym) return null
      return checker.typeToString(checker.getTypeOfSymbolAtLocation(memberSym, atNode), atNode, FF)
    }
  }

  function propKey(name: string): string {
    return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name)
  }
}
