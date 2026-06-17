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
import { createRequire } from "node:module";
import * as path from "node:path";
const require_ = createRequire(import.meta.url);
let tsModule;
function loadTs() {
    if (!tsModule) {
        try {
            tsModule = require_("typescript");
        }
        catch (_a) {
            throw new Error("static model codegen requires the `typescript` package to be installed");
        }
    }
    return tsModule;
}
function parseTsConfig(ts, tsconfigPath) {
    const read = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
    if (read.error) {
        throw new Error(`Failed to read tsconfig ${tsconfigPath}: ${ts.flattenDiagnosticMessageText(read.error.messageText, "\n")}`);
    }
    const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, path.dirname(tsconfigPath));
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
        },
        fileNames: parsed.fileNames
    };
}
export function createModelTypeResolver(args) {
    var _a;
    const ts = loadTs();
    const { fileNames, options } = parseTsConfig(ts, args.tsconfigPath);
    const roots = Array.from(new Set([...fileNames, ...((_a = args.files) !== null && _a !== void 0 ? _a : [])].map((f) => path.resolve(f))));
    let program;
    let checker;
    const getProgram = () => {
        if (!program) {
            program = ts.createProgram(roots, options);
            checker = program.getTypeChecker();
        }
        return { program: program, checker: checker };
    };
    return {
        generate(filename, modelNames, opts) {
            const { program, checker } = getProgram();
            const sf = program.getSourceFile(path.resolve(filename));
            if (!sf)
                return null;
            const wanted = new Set(modelNames);
            // Name identifier of the schema that backs each model. The private `_X`
            // (class `class _X extends S.Opaque(...)` OR const `const _X = S.Struct(...)`,
            // the base-mode form) holds the real schema; the exported facade
            // `X extends OpaqueFacade<X, X.Encoded, ...>` / `extends __X` is
            // self-referential and can't resolve `Encoded`/`Type`/`Make`. Prefer `_X`.
            const schemaByName = new Map();
            const privateNames = new Set();
            const consider = (text, nameNode) => {
                if (text.startsWith("_") && !text.startsWith("__") && wanted.has(text.slice(1))) {
                    schemaByName.set(text.slice(1), nameNode);
                    privateNames.add(text.slice(1));
                }
                else if (wanted.has(text) && !privateNames.has(text)) {
                    schemaByName.set(text, nameNode);
                }
            };
            sf.forEachChild((n) => {
                if (ts.isClassDeclaration(n) && n.name)
                    consider(n.name.text, n.name);
                else if (ts.isVariableStatement(n)) {
                    for (const d of n.declarationList.declarations) {
                        if (ts.isIdentifier(d.name))
                            consider(d.name.text, d.name);
                    }
                }
            });
            if (schemaByName.size === 0)
                return null;
            const printer = makePrinter(ts, checker, wanted);
            const blocks = [];
            const facadeType = (body) => body.replace(/\.Type\b/g, "").replace(/\n    /g, "\n  ").replace(/\n  }$/, "\n}");
            for (const name of modelNames) {
                const nameNode = schemaByName.get(name);
                if (!nameNode)
                    return null;
                const sym = checker.getSymbolAtLocation(nameNode);
                if (!sym)
                    return null;
                const schemaType = checker.getTypeOfSymbolAtLocation(sym, nameNode);
                const encoded = printer.member(schemaType, "Encoded", nameNode);
                if (encoded === null)
                    return null;
                const emitType = opts.facade || opts.type || opts.make;
                const emitMake = opts.facade || opts.make;
                const lines = opts.facade
                    ? []
                    : [`export namespace ${name} {`, `  export interface Encoded ${encoded}`];
                if (emitType) {
                    const typ = printer.member(schemaType, "Type", nameNode);
                    if (typ === null)
                        return null;
                    if (opts.facade) {
                        // Note: instance getters/methods are already included by `member(...)`
                        // above — an Opaque/Class `Self` is the class instance type, so the
                        // checker reports getters as properties of `Type`. No re-attach needed.
                        lines.push(`export interface ${name} ${facadeType(typ)}`);
                        lines.push(`export namespace ${name} {`);
                        lines.push(`  export interface Encoded ${encoded}`);
                    }
                    else {
                        lines.push(`  export interface Type ${typ}`);
                    }
                }
                if (emitMake) {
                    const mk = printer.makeMember(schemaType, nameNode);
                    if (mk === null)
                        return null;
                    // A leading `= ` marks a type-alias emission (e.g. `{...} | void`, which
                    // an interface can't express); otherwise it's an interface body.
                    lines.push(mk.startsWith("=") ? `  export type Make ${mk}` : `  export interface Make ${mk}`);
                }
                if (opts.facade) {
                    const decodingServices = printer.serviceMember(schemaType, "DecodingServices", nameNode);
                    const encodingServices = printer.serviceMember(schemaType, "EncodingServices", nameNode);
                    if (decodingServices === null || encodingServices === null)
                        return null;
                    lines.push(`  export type DecodingServices = ${decodingServices}`);
                    lines.push(`  export type EncodingServices = ${encodingServices}`);
                }
                lines.push("}");
                blocks.push(lines.join("\n"));
            }
            return blocks.join("\n");
        }
    };
}
function makePrinter(ts, checker, modelNames) {
    // Note: deliberately NOT using `InTypeAlias` — that flag expands the alias being
    // printed (turning `NonEmptyString255` into `string & ...Brand`). Without it,
    // typeToString prefers the named alias symbol when one exists.
    const FF = ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseFullyQualifiedType;
    // A field whose printed expansion is this big (or multi-line) is worth replacing
    // with a const reference, when one is available.
    const FIELD_REDIRECT_LIMIT = 200;
    const skipAlias = (s) => (s.flags & ts.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(s) : s;
    // Prefix a model symbol with its enclosing namespace(s): a model `Label` nested in
    // `namespace ProcessingStates` is referenced as `ProcessingStates.Label`. Walks up
    // namespace/module parents, stopping at the source-file module (a quoted path).
    function qualify(sym) {
        let name = sym.name;
        let p = sym.parent;
        while (p) {
            if ((p.flags & (ts.SymbolFlags.ValueModule | ts.SymbolFlags.NamespaceModule)) === 0)
                break;
            if (!p.name || p.name.startsWith("\"") || p.name.startsWith("'"))
                break;
            name = `${p.name}.${name}`;
            p = p.parent;
        }
        return name;
    }
    // A symbol whose `X.Encoded`/`X.Type` resolves in this file: one of this file's
    // models, or any imported class/interface/namespace.
    function isModelParent(p) {
        if (modelNames.has(p.name))
            return true;
        return (p.flags & (ts.SymbolFlags.Class | ts.SymbolFlags.Interface | ts.SymbolFlags.ValueModule | ts.SymbolFlags.NamespaceModule)) !== 0;
    }
    // If `t` is a model's `Encoded` namespace interface -> "Ns.Name.Encoded".
    function modelEncodedName(t) {
        var _a;
        const sym = ((_a = t.aliasSymbol) !== null && _a !== void 0 ? _a : t.symbol);
        if (!sym || sym.name !== "Encoded" || !sym.parent)
            return null;
        if (isModelParent(sym.parent))
            return `${qualify(sym.parent)}.Encoded`;
        return null;
    }
    // If `t` is a model's instance type -> "Ns.Name.Type". Two shapes occur:
    //  - Self = the class (before/without the self-rewrite): symbol name === ModelName.
    //  - Self = `X.Type` (after the self-rewrite): symbol is the `Type` interface,
    //    name === "Type", parent === ModelName.
    function modelTypeName(t) {
        var _a;
        const sym = ((_a = t.aliasSymbol) !== null && _a !== void 0 ? _a : t.symbol);
        if (!sym)
            return null;
        if (sym.name === "Type" && sym.parent && isModelParent(sym.parent))
            return `${qualify(sym.parent)}.Type`;
        if (modelNames.has(sym.name))
            return `${sym.name}.Type`;
        return null;
    }
    // An anonymous object literal type (inline struct), as opposed to a named
    // interface/class (Date, branded scalars, library types) which we keep by name.
    function isAnonymousObject(t) {
        if ((t.flags & ts.TypeFlags.Object) === 0)
            return false;
        if (t.objectFlags & ts.ObjectFlags.Anonymous) {
            const sym = t.symbol;
            // TypeLiteral / ObjectLiteral symbols are inline; a named interface is not.
            return !sym || (sym.flags & (ts.SymbolFlags.TypeLiteral | ts.SymbolFlags.ObjectLiteral)) !== 0;
        }
        return false;
    }
    // Wrap a printed element in parens when used as an array/tuple element and it
    // contains a top-level union/intersection (precedence).
    function asElement(s) {
        // Parenthesize unions/intersections AND `readonly`-prefixed elements (nested
        // arrays/tuples) so `ReadonlyArray<readonly [..]>` prints as
        // `readonly (readonly [..])[]`, not the invalid `readonly readonly [..][]`.
        return /[|&]/.test(s) || s.startsWith("readonly ") ? `(${s})` : s;
    }
    // Parenthesize a reference used as an array element where precedence matters.
    const parenElem = (s) => /[|&]/.test(s) || s.startsWith("typeof ") || s.startsWith("readonly ") ? `(${s})` : s;
    // A printed field type large enough to be worth replacing with a const reference:
    // a multi-line object expansion, or a long single line (a huge union that would
    // otherwise be one formatter-crashing line).
    const wouldExpandBig = (printed) => printed.includes("\n") || printed.length > FIELD_REDIRECT_LIMIT;
    // --- schema-AST capture: recover named references for a field, so a big expansion
    // can be replaced by `X.Encoded` / `typeof X.Encoded` / a union/wrapper of those ---
    const PASSTHROUGH = new Set(["withConstructorDefault", "withDefault", "withDecodingDefault", "annotations"]);
    const isPassthrough = (n) => !!n && ts.isIdentifier(n) && PASSTHROUGH.has(n.text);
    function wrapperKind(name) {
        switch (name) {
            case "NonEmptyArray":
            case "NonEmptyReadonlyArray":
            case "NonEmptyChunk":
                return "nonempty";
            case "Array":
            case "ReadonlyArray":
            case "Chunk":
                return "array";
            case "NullOr":
            case "NullishOr":
                return "nullor";
        }
        return "";
    }
    const calleeName = (e) => !e ? "" : ts.isIdentifier(e) ? e.text : ts.isPropertyAccessExpression(e) ? e.name.text : "";
    // The exact source reference (`X`, `ProcessingStates.X`) of an identifier / property
    // access — guaranteed resolvable in the file we emit into.
    function nodeRefName(node) {
        if (ts.isIdentifier(node))
            return node.text;
        if (ts.isPropertyAccessExpression(node)) {
            const base = nodeRefName(node.expression);
            return base ? `${base}.${node.name.text}` : "";
        }
        return "";
    }
    // Resolve an uppercase-named schema const a node refers to; null for method names
    // (`withConstructorDefault`) or non-consts (`Struct`).
    function resolveConst(node) {
        let s = checker.getSymbolAtLocation(node);
        if (!s)
            return null;
        s = skipAlias(s);
        if (!s.name || s.name[0] < "A" || s.name[0] > "Z")
            return null;
        const name = nodeRefName(node);
        return name ? { sym: s, name } : null;
    }
    // Recover named references from a field value: a bare/namespaced identifier, a
    // recognised wrapper (`NonEmptyArray(X)`, `NullOr(X)`), a `Union([A, B, …])`, or any
    // of those behind a type-preserving accessor (`.withConstructorDefault`).
    function fieldRefOf(val) {
        if (ts.isIdentifier(val) || ts.isPropertyAccessExpression(val)) {
            const r = resolveConst(val);
            if (r)
                return { refs: [r], wrapper: "", nullable: false };
            if (ts.isPropertyAccessExpression(val) && isPassthrough(val.name))
                return fieldRefOf(val.expression);
            return null;
        }
        if (ts.isCallExpression(val)) {
            const callee = val.expression;
            const name = calleeName(callee);
            const args = val.arguments;
            const wk = wrapperKind(name);
            if (wk === "nonempty" || wk === "array") {
                if (args.length === 1) {
                    const inner = fieldRefOf(args[0]);
                    if (inner && inner.wrapper === "" && !inner.nullable) {
                        inner.wrapper = wk;
                        return inner;
                    }
                }
                return null;
            }
            if (wk === "nullor") {
                if (args.length === 1) {
                    const inner = fieldRefOf(args[0]);
                    if (inner && !inner.nullable) {
                        inner.nullable = true;
                        return inner;
                    }
                }
                return null;
            }
            const arg0 = args[0];
            if (name === "Union" && args.length === 1 && arg0 && ts.isArrayLiteralExpression(arg0)) {
                const refs = [];
                for (const el of arg0.elements) {
                    const r = resolveConst(el);
                    if (!r)
                        return null; // a non-const member -> can't name them all
                    refs.push(r);
                }
                return refs.length > 0 ? { refs, wrapper: "", nullable: false } : null;
            }
            // fluent method on a schema value: `X.withConstructorDefault(...)` -> receiver
            if (ts.isPropertyAccessExpression(callee) && isPassthrough(callee.name))
                return fieldRefOf(callee.expression);
        }
        return null;
    }
    // Map each field of the model's backing schema to its named reference(s), by walking
    // the `_X` declaration's source AST. Follows object spreads (`...projectedFields`) so
    // fields merged in by spread are captured too. Robust to `.pipe(encodeKeys/…)`.
    function structFieldSymbols(nameNode) {
        const out = new Map();
        const nsym = checker.getSymbolAtLocation(nameNode);
        const decl = nsym === null || nsym === void 0 ? void 0 : nsym.valueDeclaration;
        if (!decl || !ts.isVariableDeclaration(decl) || !decl.initializer)
            return out;
        const visited = new Set();
        const walk = (n) => {
            n.forEachChild((c) => {
                if (ts.isPropertyAssignment(c)) {
                    const pn = c.name;
                    const fn = ts.isIdentifier(pn) || ts.isStringLiteral(pn) || ts.isNumericLiteral(pn) ? pn.text : undefined;
                    if (fn !== undefined && c.initializer && !out.has(fn)) {
                        const ref = fieldRefOf(c.initializer);
                        if (ref)
                            out.set(fn, ref);
                    }
                }
                else if (ts.isSpreadAssignment(c) && ts.isIdentifier(c.expression)) {
                    let s = checker.getSymbolAtLocation(c.expression);
                    if (s) {
                        s = skipAlias(s);
                        if (!visited.has(s) && s.valueDeclaration && ts.isVariableDeclaration(s.valueDeclaration) && s.valueDeclaration.initializer) {
                            visited.add(s);
                            walk(s.valueDeclaration.initializer);
                        }
                    }
                }
                walk(c);
                return undefined;
            });
        };
        walk(decl.initializer);
        return out;
    }
    // The const-reference fallback chain for one ref (per `key`):
    //  1. `X.Encoded` / `X` / `X.Make` when the declaration exists (namespace `Encoded`,
    //     a `type X` alias / class, namespace `Make`),
    //  2. else `typeof X.Encoded` / `typeof X.Type` / `typeof X["~type.make.in"]`.
    function constLeaf(r, key) {
        const { name, sym } = r;
        const exports = sym.exports;
        switch (key) {
            case "Encoded":
                if (exports === null || exports === void 0 ? void 0 : exports.has("Encoded"))
                    return `${name}.Encoded`;
                return `typeof ${name}.Encoded`;
            case "Type":
                // A class/interface/alias name already denotes the decoded type directly.
                if ((sym.flags & (ts.SymbolFlags.TypeAlias | ts.SymbolFlags.Class | ts.SymbolFlags.Interface)) !== 0)
                    return name;
                return `typeof ${name}.Type`;
            case "Make":
                if (exports === null || exports === void 0 ? void 0 : exports.has("Make"))
                    return `${name}.Make`;
                return `typeof ${name}["~type.make.in"]`;
        }
    }
    // Build the reference type for a field backed by named const(s), rebuilding the shape
    // (`null | A.Encoded | typeof B.Encoded`, `readonly [X.Encoded, ...]`) around the
    // leaves. Returns "" when any leaf isn't nameable.
    function fieldConstRef(ref, key) {
        if (!ref || ref.refs.length === 0)
            return "";
        const parts = [];
        for (const r of ref.refs) {
            const leaf = constLeaf(r, key);
            if (!leaf)
                return "";
            parts.push(leaf);
        }
        let core = parts.join(" | ");
        if (ref.wrapper === "nonempty")
            core = `readonly [${core}, ...${parenElem(core)}[]]`;
        else if (ref.wrapper === "array")
            core = `readonly ${parenElem(core)}[]`;
        if (ref.nullable)
            core = `null | ${core}`;
        return core;
    }
    function print(t, atNode, side) {
        if (side === "Encoded") {
            const mn = modelEncodedName(t);
            if (mn)
                return mn;
        }
        else {
            const mn = modelTypeName(t);
            if (mn)
                return mn;
        }
        // union
        if (t.isUnion())
            return t.types.map((x) => print(x, atNode, side)).join(" | ");
        // tuple (e.g. NonEmptyArray -> readonly [E, ...(E)[]])
        if (checker.isTupleType(t)) {
            const target = t.target;
            const args = checker.getTypeArguments(t);
            const parts = args.map((a, i) => {
                const flag = target.elementFlags[i];
                const isRest = (flag & ts.ElementFlags.Rest) !== 0;
                const isOpt = (flag & ts.ElementFlags.Optional) !== 0;
                const el = print(a, atNode, side);
                return isRest ? `...${asElement(el)}[]` : `${el}${isOpt ? "?" : ""}`;
            });
            return `readonly [${parts.join(", ")}]`;
        }
        // array
        if (checker.isArrayType(t)) {
            const el = print(checker.getTypeArguments(t)[0], atNode, side);
            return `readonly ${asElement(el)}[]`;
        }
        // anonymous inline object -> expand structurally; named objects (Date, etc.) by name.
        // Multi-line: a deeply-nested inline object on one line can reach 50KB+ and crash the
        // formatter; the whitespace-insensitive codegen compare keeps this stable vs dprint.
        if (isAnonymousObject(t)) {
            const props = t.getProperties();
            if (props.length > 0)
                return expandObject(props, atNode, side);
        }
        // primitives, literals, branded scalars, named library types, etc.
        const printed = checker.typeToString(t, atNode, FF);
        // Safety net: a large object dump that `isAnonymousObject` didn't catch — expand it
        // structurally so it's multi-line and the formatter can't OOM on a giant single line.
        if (printed.length > FIELD_REDIRECT_LIMIT && (t.flags & ts.TypeFlags.Object) !== 0) {
            const props = t.getProperties();
            if (props.length > 0)
                return expandObject(props, atNode, side);
        }
        // On the Type side a branded scalar prints as `string & Ns.FooBrand`; prefer the
        // schema's companion type alias `Ns.Foo` (nominal, cheaper, what authors wrote).
        if (side === "Type")
            return namedScalar(printed);
        return printed;
    }
    function expandObject(props, atNode, side) {
        const parts = props.map((p) => {
            const pt = checker.getTypeOfSymbolAtLocation(p, atNode);
            const opt = (p.flags & ts.SymbolFlags.Optional) !== 0 ? "?" : "";
            return `readonly ${propKey(p.name)}${opt}: ${print(pt, atNode, side)}`;
        });
        return `{\n${parts.join("\n")}\n}`;
    }
    // `<base> & <Qualified>Brand` -> `<Qualified>` (the schema's companion scalar type).
    function namedScalar(s) {
        const m = /^[\w.[\]"'| ]+ & ([\w.$]+)Brand$/.exec(s);
        return m ? m[1] : s;
    }
    return {
        /**
         * Non-static instance getters/methods declared on the model class body. They
         * live on the runtime `_X` (inherited by the facade `X`) but are not schema
         * fields, so they must be re-attached to the generated `Self` interface.
         */
        instanceMembers(cls) {
            const out = [];
            for (const m of cls.members) {
                const isStatic = (ts.getCombinedModifierFlags(m) & ts.ModifierFlags.Static) !== 0;
                if (isStatic || !m.name || !ts.isIdentifier(m.name))
                    continue;
                const memberName = m.name.text;
                if (ts.isGetAccessorDeclaration(m)) {
                    const t = checker.getTypeAtLocation(m);
                    out.push(`readonly ${memberName}: ${checker.typeToString(t, m, FF)}`);
                }
                else if (ts.isMethodDeclaration(m)) {
                    const t = checker.getTypeAtLocation(m);
                    out.push(`readonly ${memberName}: ${checker.typeToString(t, m, FF)}`);
                }
            }
            return out;
        },
        /** Expand the top-level `Encoded`/`Type` interface of `schemaType` one level, nested by name. */
        member(schemaType, key, atNode) {
            const memberSym = checker.getPropertyOfType(schemaType, key);
            if (!memberSym)
                return null;
            const memberType = checker.getTypeOfSymbolAtLocation(memberSym, atNode);
            const props = memberType.getProperties();
            if (props.length === 0) {
                // Not an expandable object (e.g. opaque already); fall back to a printed reference.
                return `extends ${checker.typeToString(memberType, atNode, FF)} {}`;
            }
            const fieldSyms = structFieldSymbols(atNode);
            const body = props
                .map((p) => {
                const pt = checker.getTypeOfSymbolAtLocation(p, atNode);
                const opt = (p.flags & ts.SymbolFlags.Optional) !== 0 ? "?" : "";
                // A field that expands big AND is backed by named schema const(s) -> reference
                // them (`X.Encoded` / `typeof X.Encoded` / wrapper shape) instead of expanding.
                let val = print(pt, atNode, key);
                if (wouldExpandBig(val)) {
                    const ref = fieldConstRef(fieldSyms.get(p.name), key);
                    if (ref)
                        val = ref;
                }
                return `    readonly ${propKey(p.name)}${opt}: ${val}`;
            })
                .join("\n");
            return `{\n${body}\n  }`;
        },
        /**
         * Expand the `make`-input interface (`~type.make.in`). Keys + optionality come from the
         * make-input member (so defaulted fields and `_tag` are optional); each value is the
         * Type-side shape with nested model refs rewritten `.Type` -> `.Make`.
         */
        makeMember(schemaType, atNode) {
            var _a;
            const makeSym = checker.getPropertyOfType(schemaType, "~type.make.in");
            const typeSym = checker.getPropertyOfType(schemaType, "Type");
            if (!makeSym || !typeSym)
                return null;
            const rawMakeType = checker.getTypeOfSymbolAtLocation(makeSym, atNode);
            const typeType = checker.getTypeOfSymbolAtLocation(typeSym, atNode);
            // `withConstructorDefault` makes the make-input `void | { ...all optional }`.
            // The `void` is NOT cosmetic: effect-app's `make`/`makeEffect` key off it to
            // make the input argument optional (a no-arg call). So we must preserve it.
            // A union has no own properties and `interface Make extends void | {...}` is a
            // syntax error, so when `void`/`undefined` is present we emit a TYPE ALIAS
            // (`export type Make = { ... } | void`) — signalled by a leading `= `.
            const isVoidish = (t) => (t.flags & (ts.TypeFlags.Void | ts.TypeFlags.Undefined)) !== 0;
            const hasVoid = rawMakeType.isUnion() && rawMakeType.types.some(isVoidish);
            const makeType = rawMakeType.isUnion()
                ? ((_a = rawMakeType.types.find((t) => t.getProperties().length > 0)) !== null && _a !== void 0 ? _a : rawMakeType)
                : rawMakeType;
            const makeProps = makeType.getProperties();
            if (makeProps.length === 0) {
                const printed = checker.typeToString(rawMakeType, atNode, FF);
                return `= ${printed}`;
            }
            const typeByName = new Map(typeType.getProperties().map((p) => [p.name, p]));
            const fieldSyms = structFieldSymbols(atNode);
            const body = makeProps
                .map((p) => {
                var _a;
                const opt = (p.flags & ts.SymbolFlags.Optional) !== 0 ? "?" : "";
                const source = (_a = typeByName.get(p.name)) !== null && _a !== void 0 ? _a : p;
                const printed = print(checker.getTypeOfSymbolAtLocation(source, atNode), atNode, "Type");
                // nested model `Foo.Type` becomes `Foo.Make`; scalars / Date / primitives untouched.
                let value = printed.replace(/\.Type\b/g, ".Make");
                if (wouldExpandBig(value)) {
                    const ref = fieldConstRef(fieldSyms.get(p.name), "Make");
                    if (ref)
                        value = ref;
                }
                return `    readonly ${propKey(p.name)}${opt}: ${value}`;
            })
                .join("\n");
            // Leading `= ` marks a type-alias emission (model.ts emits `export type Make = ...`).
            return hasVoid ? `= {\n${body}\n  } | void` : `{\n${body}\n  }`;
        },
        serviceMember(schemaType, key, atNode) {
            const memberSym = checker.getPropertyOfType(schemaType, key);
            if (!memberSym)
                return null;
            return checker.typeToString(checker.getTypeOfSymbolAtLocation(memberSym, atNode), atNode, FF);
        }
    };
    function propKey(name) {
        return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHlwZS1yZXNvbHZlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9zaGFyZWQvdHlwZS1yZXNvbHZlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7Ozs7Ozs7Ozs7O0dBWUc7QUFDSCxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sYUFBYSxDQUFBO0FBQzNDLE9BQU8sS0FBSyxJQUFJLE1BQU0sV0FBVyxDQUFBO0FBRWpDLE1BQU0sUUFBUSxHQUFHLGFBQWEsQ0FBQyxPQUFPLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQTtBQTRCL0MsSUFBSSxRQUF3QixDQUFBO0FBQzVCLFNBQVMsTUFBTTtJQUNiLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUNkLElBQUksQ0FBQztZQUNILFFBQVEsR0FBRyxRQUFRLENBQUMsWUFBWSxDQUFPLENBQUE7UUFDekMsQ0FBQzttQkFBTyxDQUFDO1lBQ1AsTUFBTSxJQUFJLEtBQUssQ0FBQyx3RUFBd0UsQ0FBQyxDQUFBO1FBQzNGLENBQUM7SUFDSCxDQUFDO0lBQ0QsT0FBTyxRQUFRLENBQUE7QUFDakIsQ0FBQztBQUVELFNBQVMsYUFBYSxDQUNwQixFQUFNLEVBQ04sWUFBb0I7SUFFcEIsTUFBTSxJQUFJLEdBQUcsRUFBRSxDQUFDLGNBQWMsQ0FBQyxZQUFZLEVBQUUsRUFBRSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsQ0FBQTtJQUM3RCxJQUFJLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNmLE1BQU0sSUFBSSxLQUFLLENBQ2IsMkJBQTJCLFlBQVksS0FBSyxFQUFFLENBQUMsNEJBQTRCLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxXQUFXLEVBQUUsSUFBSSxDQUFDLEVBQUUsQ0FDNUcsQ0FBQTtJQUNILENBQUM7SUFDRCxNQUFNLE1BQU0sR0FBRyxFQUFFLENBQUMsMEJBQTBCLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUMsR0FBRyxFQUFFLElBQUks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