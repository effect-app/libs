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
    return { options: { ...parsed.options, noEmit: true, composite: false, incremental: false, skipLibCheck: true, declaration: false }, fileNames: parsed.fileNames };
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
            const classByName = new Map();
            sf.forEachChild((n) => {
                if (ts.isClassDeclaration(n) && n.name) {
                    const text = n.name.text;
                    if (wanted.has(text)) {
                        classByName.set(text, n);
                    }
                    else if (text.startsWith("_") && wanted.has(text.slice(1))) {
                        classByName.set(text.slice(1), n);
                    }
                }
            });
            if (classByName.size === 0)
                return null;
            const printer = makePrinter(ts, checker, wanted);
            const blocks = [];
            const facadeType = (body) => body.replace(/\.Type\b/g, "").replace(/\n    /g, "\n  ").replace(/\n  }$/, "\n}");
            for (const name of modelNames) {
                const cls = classByName.get(name);
                if (!cls || !cls.name)
                    return null;
                const sym = checker.getSymbolAtLocation(cls.name);
                if (!sym)
                    return null;
                const schemaType = checker.getTypeOfSymbolAtLocation(sym, cls.name);
                const encoded = printer.member(schemaType, "Encoded", cls.name);
                if (encoded === null)
                    return null;
                const emitType = opts.facade || opts.type || opts.make;
                const emitMake = opts.facade || opts.make;
                const lines = opts.facade
                    ? []
                    : [`export namespace ${name} {`, `  export interface Encoded ${encoded}`];
                if (emitType) {
                    const typ = printer.member(schemaType, "Type", cls.name);
                    if (typ === null)
                        return null;
                    if (opts.facade) {
                        lines.push(`export interface ${name} ${facadeType(typ)}`);
                        lines.push(`export namespace ${name} {`);
                        lines.push(`  export interface Encoded ${encoded}`);
                    }
                    else {
                        lines.push(`  export interface Type ${typ}`);
                    }
                }
                if (emitMake) {
                    const mk = printer.makeMember(schemaType, cls.name);
                    if (mk === null)
                        return null;
                    lines.push(`  export interface Make ${mk}`);
                }
                if (opts.facade) {
                    const decodingServices = printer.serviceMember(schemaType, "DecodingServices", cls.name);
                    const encodingServices = printer.serviceMember(schemaType, "EncodingServices", cls.name);
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
        return /[|&]/.test(s) ? `(${s})` : s;
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
            const makeSym = checker.getPropertyOfType(schemaType, "~type.make.in");
            const typeSym = checker.getPropertyOfType(schemaType, "Type");
            if (!makeSym || !typeSym)
                return null;
            const makeType = checker.getTypeOfSymbolAtLocation(makeSym, atNode);
            const typeType = checker.getTypeOfSymbolAtLocation(typeSym, atNode);
            const makeProps = makeType.getProperties();
            if (makeProps.length === 0) {
                return `extends ${checker.typeToString(makeType, atNode, FF)} {}`;
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
            return `{\n${body}\n  }`;
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