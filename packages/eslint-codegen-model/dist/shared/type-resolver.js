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
    const options = { ...parsed.options, noEmit: true, composite: false, incremental: false, skipLibCheck: true, declaration: false, stableTypeOrdering: true };
    return { options, fileNames: parsed.fileNames };
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
            // `X extends OpaqueFacadeClass<X, X.Encoded, ...>` / `extends __X` is
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
    // If `t` is a model's `Encoded` namespace interface -> "Name.Encoded".
    function modelEncodedName(t) {
        var _a;
        const sym = ((_a = t.aliasSymbol) !== null && _a !== void 0 ? _a : t.symbol);
        if (!sym || sym.name !== "Encoded")
            return null;
        const parent = sym.parent;
        if (parent && modelNames.has(parent.name))
            return `${parent.name}.Encoded`;
        return null;
    }
    // If `t` is a model's instance type -> "Name.Type". Two shapes occur:
    //  - Self = the class (before/without the self-rewrite): symbol name === ModelName.
    //  - Self = `X.Type` (after the self-rewrite): symbol is the `Type` interface,
    //    name === "Type", parent === ModelName.
    function modelTypeName(t) {
        var _a;
        const sym = ((_a = t.aliasSymbol) !== null && _a !== void 0 ? _a : t.symbol);
        if (!sym)
            return null;
        if (sym.name === "Type" && sym.parent && modelNames.has(sym.parent.name))
            return `${sym.parent.name}.Type`;
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
        // anonymous inline object -> expand structurally; named objects (Date, etc.) by name
        if (isAnonymousObject(t)) {
            const props = t.getProperties();
            if (props.length > 0) {
                const parts = props.map((p) => {
                    const pt = checker.getTypeOfSymbolAtLocation(p, atNode);
                    const opt = (p.flags & ts.SymbolFlags.Optional) !== 0 ? "?" : "";
                    return `readonly ${propKey(p.name)}${opt}: ${print(pt, atNode, side)}`;
                });
                return `{ ${parts.join("; ")} }`;
            }
        }
        // primitives, literals, branded scalars, named library types, etc.
        const printed = checker.typeToString(t, atNode, FF);
        // On the Type side a branded scalar prints as `string & Ns.FooBrand`; prefer the
        // schema's companion type alias `Ns.Foo` (nominal, cheaper, what authors wrote).
        if (side === "Type")
            return namedScalar(printed);
        return printed;
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
            const body = props.map((p) => {
                const pt = checker.getTypeOfSymbolAtLocation(p, atNode);
                const opt = (p.flags & ts.SymbolFlags.Optional) !== 0 ? "?" : "";
                return `    readonly ${propKey(p.name)}${opt}: ${print(pt, atNode, key)}`;
            }).join("\n");
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
            const body = makeProps.map((p) => {
                var _a;
                const opt = (p.flags & ts.SymbolFlags.Optional) !== 0 ? "?" : "";
                const source = (_a = typeByName.get(p.name)) !== null && _a !== void 0 ? _a : p;
                const printed = print(checker.getTypeOfSymbolAtLocation(source, atNode), atNode, "Type");
                // nested model `Foo.Type` becomes `Foo.Make`; scalars / Date / primitives untouched.
                const value = printed.replace(/\.Type\b/g, ".Make");
                return `    readonly ${propKey(p.name)}${opt}: ${value}`;
            }).join("\n");
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHlwZS1yZXNvbHZlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9zaGFyZWQvdHlwZS1yZXNvbHZlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7Ozs7Ozs7Ozs7O0dBWUc7QUFDSCxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sYUFBYSxDQUFBO0FBQzNDLE9BQU8sS0FBSyxJQUFJLE1BQU0sV0FBVyxDQUFBO0FBRWpDLE1BQU0sUUFBUSxHQUFHLGFBQWEsQ0FBQyxPQUFPLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQTtBQTRCL0MsSUFBSSxRQUF3QixDQUFBO0FBQzVCLFNBQVMsTUFBTTtJQUNiLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUNkLElBQUksQ0FBQztZQUNILFFBQVEsR0FBRyxRQUFRLENBQUMsWUFBWSxDQUFPLENBQUE7UUFDekMsQ0FBQzttQkFBTyxDQUFDO1lBQ1AsTUFBTSxJQUFJLEtBQUssQ0FBQyx3RUFBd0UsQ0FBQyxDQUFBO1FBQzNGLENBQUM7SUFDSCxDQUFDO0lBQ0QsT0FBTyxRQUFRLENBQUE7QUFDakIsQ0FBQztBQUVELFNBQVMsYUFBYSxDQUFDLEVBQU0sRUFBRSxZQUFvQjtJQUNqRCxNQUFNLElBQUksR0FBRyxFQUFFLENBQUMsY0FBYyxDQUFDLFlBQVksRUFBRSxFQUFFLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFBO0lBQzdELElBQUksSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQ2YsTUFBTSxJQUFJLEtBQUssQ0FBQywyQkFBMkIsWUFBWSxLQUFLLEVBQUUsQ0FBQyw0QkFBNEIsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLFdBQVcsRUFBRSxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUE7SUFDOUgsQ0FBQztJQUNELE1BQU0sTUFBTSxHQUFHLEVBQUUsQ0FBQywwQkFBMEIsQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQyxHQUFHLEVBQUUsSUFBSSxD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