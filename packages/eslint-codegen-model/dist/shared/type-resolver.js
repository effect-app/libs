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
            const body = props
                .map((p) => {
                const pt = checker.getTypeOfSymbolAtLocation(p, atNode);
                const opt = (p.flags & ts.SymbolFlags.Optional) !== 0 ? "?" : "";
                return `    readonly ${propKey(p.name)}${opt}: ${print(pt, atNode, key)}`;
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
            const body = makeProps
                .map((p) => {
                var _a;
                const opt = (p.flags & ts.SymbolFlags.Optional) !== 0 ? "?" : "";
                const source = (_a = typeByName.get(p.name)) !== null && _a !== void 0 ? _a : p;
                const printed = print(checker.getTypeOfSymbolAtLocation(source, atNode), atNode, "Type");
                // nested model `Foo.Type` becomes `Foo.Make`; scalars / Date / primitives untouched.
                const value = printed.replace(/\.Type\b/g, ".Make");
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