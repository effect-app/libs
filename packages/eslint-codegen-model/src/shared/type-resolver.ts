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
  // `stableTypeOrdering` makes tsc order union/intersection constituents by a
  // structural compare (the same order typescript-go uses), instead of by type
  // id (creation/source order). Set it so the classic resolver's output matches
  // the native (tsgo) resolver's — no divergence when switching backends. It is
  // an internal compiler option (not in the public `CompilerOptions` type).
  return {
    options: {
      ...parsed.options,
      noEmit: true,
      composite: false,
      incremental: false,
      skipLibCheck: true,
      declaration: false,
      stableTypeOrdering: true
    } as import("typescript").CompilerOptions,
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

interface SchemaRef {
  readonly sym: Symbol_
  /** The exact in-scope reference the author wrote (`X`, `ProcessingStates.X`). */
  readonly name: string
}
interface FieldRef {
  readonly refs: ReadonlyArray<SchemaRef>
  wrapper: "" | "nonempty" | "array"
  nullable: boolean
}

function makePrinter(ts: TS, checker: TypeChecker, modelNames: ReadonlySet<string>) {
  // Note: deliberately NOT using `InTypeAlias` — that flag expands the alias being
  // printed (turning `NonEmptyString255` into `string & ...Brand`). Without it,
  // typeToString prefers the named alias symbol when one exists.
  const FF = ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseFullyQualifiedType
  // A field whose printed expansion is this big (or multi-line) is worth replacing
  // with a const reference, when one is available.
  const FIELD_REDIRECT_LIMIT = 200

  const skipAlias = (s: Symbol_): Symbol_ => (s.flags & ts.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(s) : s

  // Prefix a model symbol with its enclosing namespace(s): a model `Label` nested in
  // `namespace ProcessingStates` is referenced as `ProcessingStates.Label`. Walks up
  // namespace/module parents, stopping at the source-file module (a quoted path).
  function qualify(sym: Symbol_): string {
    let name = sym.name
    let p = (sym as Symbol_ & { parent?: Symbol_ }).parent
    while (p) {
      if ((p.flags & (ts.SymbolFlags.ValueModule | ts.SymbolFlags.NamespaceModule)) === 0) break
      if (!p.name || p.name.startsWith("\"") || p.name.startsWith("'")) break
      name = `${p.name}.${name}`
      p = (p as Symbol_ & { parent?: Symbol_ }).parent
    }
    return name
  }

  // A symbol whose `X.Encoded`/`X.Type` resolves in this file: one of this file's
  // models, or any imported class/interface/namespace.
  function isModelParent(p: Symbol_): boolean {
    if (modelNames.has(p.name)) return true
    return (p.flags & (ts.SymbolFlags.Class | ts.SymbolFlags.Interface | ts.SymbolFlags.ValueModule | ts.SymbolFlags.NamespaceModule)) !== 0
  }

  // If `t` is a model's `Encoded` namespace interface -> "Ns.Name.Encoded".
  function modelEncodedName(t: Type): string | null {
    const sym = (t.aliasSymbol ?? t.symbol) as (Symbol_ & { parent?: Symbol_ }) | undefined
    if (!sym || sym.name !== "Encoded" || !sym.parent) return null
    if (isModelParent(sym.parent)) return `${qualify(sym.parent)}.Encoded`
    return null
  }

  // If `t` is a model's instance type -> "Ns.Name.Type". Two shapes occur:
  //  - Self = the class (before/without the self-rewrite): symbol name === ModelName.
  //  - Self = `X.Type` (after the self-rewrite): symbol is the `Type` interface,
  //    name === "Type", parent === ModelName.
  function modelTypeName(t: Type): string | null {
    const sym = (t.aliasSymbol ?? t.symbol) as (Symbol_ & { parent?: Symbol_ }) | undefined
    if (!sym) return null
    if (sym.name === "Type" && sym.parent && isModelParent(sym.parent)) return `${qualify(sym.parent)}.Type`
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
  // Parenthesize a reference used as an array element where precedence matters.
  const parenElem = (s: string): string =>
    /[|&]/.test(s) || s.startsWith("typeof ") || s.startsWith("readonly ") ? `(${s})` : s

  // A printed field type large enough to be worth replacing with a const reference:
  // a multi-line object expansion, or a long single line (a huge union that would
  // otherwise be one formatter-crashing line).
  const wouldExpandBig = (printed: string): boolean => printed.includes("\n") || printed.length > FIELD_REDIRECT_LIMIT

  // --- schema-AST capture: recover named references for a field, so a big expansion
  // can be replaced by `X.Encoded` / `typeof X.Encoded` / a union/wrapper of those ---

  const PASSTHROUGH = new Set(["withConstructorDefault", "withDefault", "withDecodingDefault", "annotations"])
  const isPassthrough = (n: Node | undefined): boolean =>
    !!n && ts.isIdentifier(n) && PASSTHROUGH.has(n.text)

  function wrapperKind(name: string): "" | "nonempty" | "array" | "nullor" {
    switch (name) {
      case "NonEmptyArray":
      case "NonEmptyReadonlyArray":
      case "NonEmptyChunk":
        return "nonempty"
      case "Array":
      case "ReadonlyArray":
      case "Chunk":
        return "array"
      case "NullOr":
      case "NullishOr":
        return "nullor"
    }
    return ""
  }

  const calleeName = (e: Node | undefined): string =>
    !e ? "" : ts.isIdentifier(e) ? e.text : ts.isPropertyAccessExpression(e) ? e.name.text : ""

  // The exact source reference (`X`, `ProcessingStates.X`) of an identifier / property
  // access — guaranteed resolvable in the file we emit into.
  function nodeRefName(node: Node): string {
    if (ts.isIdentifier(node)) return node.text
    if (ts.isPropertyAccessExpression(node)) {
      const base = nodeRefName(node.expression)
      return base ? `${base}.${node.name.text}` : ""
    }
    return ""
  }

  // Resolve an uppercase-named schema const a node refers to; null for method names
  // (`withConstructorDefault`) or non-consts (`Struct`).
  function resolveConst(node: Node): SchemaRef | null {
    let s = checker.getSymbolAtLocation(node)
    if (!s) return null
    s = skipAlias(s)
    if (!s.name || s.name[0]! < "A" || s.name[0]! > "Z") return null
    const name = nodeRefName(node)
    return name ? { sym: s, name } : null
  }

  // Recover named references from a field value: a bare/namespaced identifier, a
  // recognised wrapper (`NonEmptyArray(X)`, `NullOr(X)`), a `Union([A, B, …])`, or any
  // of those behind a type-preserving accessor (`.withConstructorDefault`).
  function fieldRefOf(val: Node): FieldRef | null {
    if (ts.isIdentifier(val) || ts.isPropertyAccessExpression(val)) {
      const r = resolveConst(val)
      if (r) return { refs: [r], wrapper: "", nullable: false }
      if (ts.isPropertyAccessExpression(val) && isPassthrough(val.name)) return fieldRefOf(val.expression)
      return null
    }
    if (ts.isCallExpression(val)) {
      const callee = val.expression
      const name = calleeName(callee)
      const args = val.arguments
      const wk = wrapperKind(name)
      if (wk === "nonempty" || wk === "array") {
        if (args.length === 1) {
          const inner = fieldRefOf(args[0]!)
          if (inner && inner.wrapper === "" && !inner.nullable) {
            inner.wrapper = wk
            return inner
          }
        }
        return null
      }
      if (wk === "nullor") {
        if (args.length === 1) {
          const inner = fieldRefOf(args[0]!)
          if (inner && !inner.nullable) {
            inner.nullable = true
            return inner
          }
        }
        return null
      }
      const arg0 = args[0]
      if (name === "Union" && args.length === 1 && arg0 && ts.isArrayLiteralExpression(arg0)) {
        const refs: Array<SchemaRef> = []
        for (const el of arg0.elements) {
          const r = resolveConst(el)
          if (!r) return null // a non-const member -> can't name them all
          refs.push(r)
        }
        return refs.length > 0 ? { refs, wrapper: "", nullable: false } : null
      }
      // fluent method on a schema value: `X.withConstructorDefault(...)` -> receiver
      if (ts.isPropertyAccessExpression(callee) && isPassthrough(callee.name)) return fieldRefOf(callee.expression)
    }
    return null
  }

  // Map each field of the model's backing schema to its named reference(s), by walking
  // the `_X` declaration's source AST. Follows object spreads (`...projectedFields`) so
  // fields merged in by spread are captured too. Robust to `.pipe(encodeKeys/…)`.
  function structFieldSymbols(nameNode: Node): Map<string, FieldRef> {
    const out = new Map<string, FieldRef>()
    const nsym = checker.getSymbolAtLocation(nameNode)
    const decl = nsym?.valueDeclaration
    if (!decl || !ts.isVariableDeclaration(decl) || !decl.initializer) return out
    const visited = new Set<Symbol_>()
    const walk = (n: Node): void => {
      n.forEachChild((c) => {
        if (ts.isPropertyAssignment(c)) {
          const pn = c.name
          const fn = ts.isIdentifier(pn) || ts.isStringLiteral(pn) || ts.isNumericLiteral(pn) ? pn.text : undefined
          if (fn !== undefined && c.initializer && !out.has(fn)) {
            const ref = fieldRefOf(c.initializer)
            if (ref) out.set(fn, ref)
          }
        } else if (ts.isSpreadAssignment(c) && ts.isIdentifier(c.expression)) {
          let s = checker.getSymbolAtLocation(c.expression)
          if (s) {
            s = skipAlias(s)
            if (!visited.has(s) && s.valueDeclaration && ts.isVariableDeclaration(s.valueDeclaration) && s.valueDeclaration.initializer) {
              visited.add(s)
              walk(s.valueDeclaration.initializer)
            }
          }
        }
        walk(c)
        return undefined
      })
    }
    walk(decl.initializer)
    return out
  }

  // The const-reference fallback chain for one ref (per `key`):
  //  1. `X.Encoded` / `X` / `X.Make` when the declaration exists (namespace `Encoded`,
  //     a `type X` alias / class, namespace `Make`),
  //  2. else `typeof X.Encoded` / `typeof X.Type` / `typeof X["~type.make.in"]`.
  function constLeaf(r: SchemaRef, key: "Encoded" | "Type" | "Make"): string {
    const { name, sym } = r
    const exports = (sym as Symbol_ & { exports?: import("typescript").SymbolTable }).exports
    switch (key) {
      case "Encoded":
        if (exports?.has("Encoded" as import("typescript").__String)) return `${name}.Encoded`
        return `typeof ${name}.Encoded`
      case "Type":
        // A class/interface/alias name already denotes the decoded type directly.
        if ((sym.flags & (ts.SymbolFlags.TypeAlias | ts.SymbolFlags.Class | ts.SymbolFlags.Interface)) !== 0) return name
        return `typeof ${name}.Type`
      case "Make":
        if (exports?.has("Make" as import("typescript").__String)) return `${name}.Make`
        return `typeof ${name}["~type.make.in"]`
    }
  }

  // Build the reference type for a field backed by named const(s), rebuilding the shape
  // (`null | A.Encoded | typeof B.Encoded`, `readonly [X.Encoded, ...]`) around the
  // leaves. Returns "" when any leaf isn't nameable.
  function fieldConstRef(ref: FieldRef | undefined, key: "Encoded" | "Type" | "Make"): string {
    if (!ref || ref.refs.length === 0) return ""
    const parts: Array<string> = []
    for (const r of ref.refs) {
      const leaf = constLeaf(r, key)
      if (!leaf) return ""
      parts.push(leaf)
    }
    let core = parts.join(" | ")
    if (ref.wrapper === "nonempty") core = `readonly [${core}, ...${parenElem(core)}[]]`
    else if (ref.wrapper === "array") core = `readonly ${parenElem(core)}[]`
    if (ref.nullable) core = `null | ${core}`
    return core
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
    // anonymous inline object -> expand structurally; named objects (Date, etc.) by name.
    // Multi-line: a deeply-nested inline object on one line can reach 50KB+ and crash the
    // formatter; the whitespace-insensitive codegen compare keeps this stable vs dprint.
    if (isAnonymousObject(t)) {
      const props = t.getProperties()
      if (props.length > 0) return expandObject(props, atNode, side)
    }
    // primitives, literals, branded scalars, named library types, etc.
    const printed = checker.typeToString(t, atNode, FF)
    // Safety net: a large object dump that `isAnonymousObject` didn't catch — expand it
    // structurally so it's multi-line and the formatter can't OOM on a giant single line.
    if (printed.length > FIELD_REDIRECT_LIMIT && (t.flags & ts.TypeFlags.Object) !== 0) {
      const props = t.getProperties()
      if (props.length > 0) return expandObject(props, atNode, side)
    }
    // On the Type side a branded scalar prints as `string & Ns.FooBrand`; prefer the
    // schema's companion type alias `Ns.Foo` (nominal, cheaper, what authors wrote).
    if (side === "Type") return namedScalar(printed)
    return printed
  }

  function expandObject(props: ReadonlyArray<Symbol_>, atNode: Node, side: "Encoded" | "Type"): string {
    const parts = props.map((p) => {
      const pt = checker.getTypeOfSymbolAtLocation(p, atNode)
      const opt = (p.flags & ts.SymbolFlags.Optional) !== 0 ? "?" : ""
      return `readonly ${propKey(p.name)}${opt}: ${print(pt, atNode, side)}`
    })
    return `{\n${parts.join("\n")}\n}`
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
      const fieldSyms = structFieldSymbols(atNode)
      const body = props
        .map((p) => {
          const pt = checker.getTypeOfSymbolAtLocation(p, atNode)
          const opt = (p.flags & ts.SymbolFlags.Optional) !== 0 ? "?" : ""
          // A field that expands big AND is backed by named schema const(s) -> reference
          // them (`X.Encoded` / `typeof X.Encoded` / wrapper shape) instead of expanding.
          let val = print(pt, atNode, key)
          if (wouldExpandBig(val)) {
            const ref = fieldConstRef(fieldSyms.get(p.name), key)
            if (ref) val = ref
          }
          return `    readonly ${propKey(p.name)}${opt}: ${val}`
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
      const fieldSyms = structFieldSymbols(atNode)
      const body = makeProps
        .map((p) => {
          const opt = (p.flags & ts.SymbolFlags.Optional) !== 0 ? "?" : ""
          const source = typeByName.get(p.name) ?? p
          const printed = print(checker.getTypeOfSymbolAtLocation(source, atNode), atNode, "Type")
          // nested model `Foo.Type` becomes `Foo.Make`; scalars / Date / primitives untouched.
          let value = printed.replace(/\.Type\b/g, ".Make")
          if (wouldExpandBig(value)) {
            const ref = fieldConstRef(fieldSyms.get(p.name), "Make")
            if (ref) value = ref
          }
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
