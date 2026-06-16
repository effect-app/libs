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
                if (ts.isClassDeclaration(n) && n.name && wanted.has(n.name.text)) {
                    classByName.set(n.name.text, n);
                }
            });
            if (classByName.size === 0)
                return null;
            const printer = makePrinter(ts, checker, wanted);
            const blocks = [];
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
                const lines = [`export namespace ${name} {`, `  export interface Encoded ${encoded}`];
                if (opts.type || opts.make) {
                    const typ = printer.member(schemaType, "Type", cls.name);
                    if (typ === null)
                        return null;
                    lines.push(`  export interface Type ${typ}`);
                }
                if (opts.make) {
                    const mk = printer.makeMember(schemaType, cls.name);
                    if (mk === null)
                        return null;
                    lines.push(`  export interface Make ${mk}`);
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
        }
    };
    function propKey(name) {
        return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHlwZS1yZXNvbHZlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9zaGFyZWQvdHlwZS1yZXNvbHZlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7Ozs7Ozs7Ozs7O0dBWUc7QUFDSCxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sYUFBYSxDQUFBO0FBQzNDLE9BQU8sS0FBSyxJQUFJLE1BQU0sV0FBVyxDQUFBO0FBRWpDLE1BQU0sUUFBUSxHQUFHLGFBQWEsQ0FBQyxPQUFPLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQTtBQTBCL0MsSUFBSSxRQUF3QixDQUFBO0FBQzVCLFNBQVMsTUFBTTtJQUNiLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUNkLElBQUksQ0FBQztZQUNILFFBQVEsR0FBRyxRQUFRLENBQUMsWUFBWSxDQUFPLENBQUE7UUFDekMsQ0FBQzttQkFBTyxDQUFDO1lBQ1AsTUFBTSxJQUFJLEtBQUssQ0FBQyx3RUFBd0UsQ0FBQyxDQUFBO1FBQzNGLENBQUM7SUFDSCxDQUFDO0lBQ0QsT0FBTyxRQUFRLENBQUE7QUFDakIsQ0FBQztBQUVELFNBQVMsYUFBYSxDQUFDLEVBQU0sRUFBRSxZQUFvQjtJQUNqRCxNQUFNLElBQUksR0FBRyxFQUFFLENBQUMsY0FBYyxDQUFDLFlBQVksRUFBRSxFQUFFLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFBO0lBQzdELElBQUksSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQ2YsTUFBTSxJQUFJLEtBQUssQ0FBQywyQkFBMkIsWUFBWSxLQUFLLEVBQUUsQ0FBQyw0QkFBNEIsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLFdBQVcsRUFBRSxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUE7SUFDOUgsQ0FBQztJQUNELE1BQU0sTUFBTSxHQUFHLEVBQUUsQ0FBQywwQkFBMEIsQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLE9BQU8sQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFBO0lBQzdGLE9BQU8sRUFBRSxPQUFPLEVBQUUsRUFBRSxHQUFHLE1BQU0sQ0FBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsS0FBSyxFQUFFLFdBQVcsRUFBRSxLQUFLLEVBQUUsWUFBWSxFQUFFLElBQUksRUFBRSxXQUFXLEVBQUUsS0FBSyxFQUFFLEVBQUUsU0FBUyxFQUFFLE1BQU0sQ0FBQyxTQUFTLEVBQUUsQ0FBQTtBQUNwSyxDQUFDO0FBRUQsTUFBTSxVQUFVLHVCQUF1QixDQUFDLElBSXZDOztJQUNDLE1BQU0sRUFBRSxHQUFHLE1BQU0sRUFBRSxDQUFBO0lBQ25CLE1BQU0sRUFBRSxTQUFTLEVBQUUsT0FBTyxFQUFFLEdBQUcsYUFBYSxDQUFDLEVBQUUsRUFBRSxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUE7SUFDbkUsTUFBTSxLQUFLLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLEdBQUcsQ0FBQyxDQUFDLEdBQUcsU0FBUyxFQUFFLEdBQUcsT0FBQyxJQUFJLENBQUMsS0FBSyxtQ0FBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQTtJQUVwRyxJQUFJLE9BQTRCLENBQUE7SUFDaEMsSUFBSSxPQUFnQyxDQUFBO0lBQ3BDLE1BQU0sVUFBVSxHQUFHLEdBQUcsRUFBRTtRQUN0QixJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDYixPQUFPLEdBQUcsRUFBRSxDQUFDLGFBQWEsQ0FBQyxLQUFLLEVBQUUsT0FBTyxDQUFDLENBQUE7WUFDMUMsT0FBTyxHQUFHLE9BQU8sQ0FBQyxjQUFjLEVBQUUsQ0FBQTtRQUNwQyxDQUFDO1FBQ0QsT0FBTyxFQUFFLE9BQU8sRUFBRSxPQUFRLEVBQUUsT0FBTyxFQUFFLE9BQVEsRUFBRSxDQUFBO0lBQ2pELENBQUMsQ0FBQTtJQUVELE9BQU87UUFDTCxRQUFRLENBQUMsUUFBUSxFQUFFLFVBQVUsRUFBRSxJQUFJO1lBQ2pDLE1BQU0sRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLEdBQUcsVUFBVSxFQUFFLENBQUE7WUFDekMsTUFBTSxFQUFFLEdBQUcsT0FBTyxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUE7WUFDeEQsSUFBSSxDQUFDLEVBQUU7Z0JBQUUsT0FBTyxJQUFJLENBQUE7WUFFcEIsTUFBTSxNQUFNLEdBQUcsSUFBSSxHQUFHLENBQUMsVUFBVSxDQUFDLENBQUE7WUFDbEMsTUFBTSxXQUFXLEdBQUcsSUFBSSxHQUFHLEVBQWlELENBQUE7WUFDNUUsRUFBRSxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFO2dCQUNwQixJQUFJLEVBQUUsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxJQUFJLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO29CQUNsRSxXQUFXLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFBO2dCQUNqQyxDQUFDO1lBQ0gsQ0FBQyxDQUFDLENBQUE7WUFDRixJQUFJLFdBQVcsQ0FBQyxJQUFJLEtBQUssQ0FBQztnQkFBRSxPQUFPLElBQUksQ0FBQTtZQUV2QyxNQUFNLE9BQU8sR0FBRyxXQUFXLENBQUMsRUFBRSxFQUFFLE9BQU8sRUFBRSxNQUFNLENBQUMsQ0FBQTtZQUNoRCxNQUFNLE1BQU0sR0FBa0IsRUFBRSxDQUFBO1lBQ2hDLEtBQUssTUFBTSxJQUFJLElBQUksVUFBVSxFQUFFLENBQUM7Z0JBQzlCLE1BQU0sR0FBRyxHQUFHLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUE7Z0JBQ2pDLElBQUksQ0FBQyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSTtvQkFBRSxPQUFPLElBQUksQ0FBQTtnQkFDbEMsTUFBTSxHQUFHLEdBQUcsT0FBTyxDQUFDLG1CQUFtQixDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQTtnQkFDakQsSUFBSSxDQUFDLEdBQUc7b0JBQUUsT0FBTyxJQUFJLENBQUE7Z0JBQ3JCLE1BQU0sVUFBVSxHQUFHLE9BQU8sQ0FBQyx5QkFBeUIsQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFBO2dCQUNuRSxNQUFNLE9BQU8sR0FBRyxPQUFPLENBQUMsTUFBTSxDQUFDLFVBQVUsRUFBRSxTQUFTLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFBO2dCQUMvRCxJQUFJLE9BQU8sS0FBSyxJQUFJO29CQUFFLE9BQU8sSUFBSSxDQUFBO2dCQUNqQyxNQUFNLEtBQUssR0FBRyxDQUFDLG9CQUFvQixJQUFJLElBQUksRUFBRSw4QkFBOEIsT0FBTyxFQUFFLENBQUMsQ0FBQTtnQkFDckYsSUFBSSxJQUFJLENBQUMsSUFBSSxJQUFJLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztvQkFDM0IsTUFBTSxHQUFHLEdBQUcsT0FBTyxDQUFDLE1BQU0sQ0FBQyxVQUFVLEVBQUUsTUFBTSxFQUFFLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQTtvQkFDeEQsSUFBSSxHQUFHLEtBQUssSUFBSTt3QkFBRSxPQUFPLElBQUksQ0FBQTtvQkFDN0IsS0FBSyxDQUFDLElBQUksQ0FBQywyQkFBMkIsR0FBRyxFQUFFLENBQUMsQ0FBQTtnQkFDOUMsQ0FBQztnQkFDRCxJQUFJLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztvQkFDZCxNQUFNLEVBQUUsR0FBRyxPQUFPLENBQUMsVUFBVSxDQUFDLFVBQVUsRUFBRSxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUE7b0JBQ25ELElBQUksRUFBRSxLQUFLLElBQUk7d0JBQUUsT0FBTyxJQUFJLENBQUE7b0JBQzVCLEtBQUssQ0FBQyxJQUFJLENBQUMsMkJBQTJCLEVBQUUsRUFBRSxDQUFDLENBQUE7Z0JBQzdDLENBQUM7Z0JBQ0QsS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQTtnQkFDZixNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQTtZQUMvQixDQUFDO1lBQ0QsT0FBTyxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFBO1FBQzFCLENBQUM7S0FDRixDQUFBO0FBQ0gsQ0FBQztBQUVELFNBQVMsV0FBVyxDQUFDLEVBQU0sRUFBRSxPQUFvQixFQUFFLFVBQStCO0lBQ2hGLGlGQUFpRjtJQUNqRiw4RUFBOEU7SUFDOUUsK0RBQStEO0lBQy9ELE1BQU0sRUFBRSxHQUFHLEVBQUUsQ0FBQyxlQUFlLENBQUMsWUFBWSxHQUFHLEVBQUUsQ0FBQyxlQUFlLENBQUMscUJBQXFCLENBQUE7SUFFckYsdUVBQXVFO0lBQ3ZFLFNBQVMsZ0JBQWdCLENBQUMsQ0FBTzs7UUFDL0IsTUFBTSxHQUFHLEdBQUcsT0FBQyxDQUFDLENBQUMsV0FBVyxtQ0FBSSxDQUFDLENBQUMsTUFBTSxDQUF3QixDQUFBO1FBQzlELElBQUksQ0FBQyxHQUFHLElBQUksR0FBRyxDQUFDLElBQUksS0FBSyxTQUFTO1lBQUUsT0FBTyxJQUFJLENBQUE7UUFDL0MsTUFBTSxNQUFNLEdBQUksR0FBc0MsQ0FBQyxNQUFNLENBQUE7UUFDN0QsSUFBSSxNQUFNLElBQUksVUFBVSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDO1lBQUUsT0FBTyxHQUFHLE1BQU0sQ0FBQyxJQUFJLFVBQVUsQ0FBQTtRQUMxRSxPQUFPLElBQUksQ0FBQTtJQUNiLENBQUM7SUFFRCxzRUFBc0U7SUFDdEUsb0ZBQW9GO0lBQ3BGLCtFQUErRTtJQUMvRSw0Q0FBNEM7SUFDNUMsU0FBUyxhQUFhLENBQUMsQ0FBTzs7UUFDNUIsTUFBTSxHQUFHLEdBQUcsT0FBQyxDQUFDLENBQUMsV0FBVyxtQ0FBSSxDQUFDLENBQUMsTUFBTSxDQUFpRCxDQUFBO1FBQ3ZGLElBQUksQ0FBQyxHQUFHO1lBQUUsT0FBTyxJQUFJLENBQUE7UUFDckIsSUFBSSxHQUFHLENBQUMsSUFBSSxLQUFLLE1BQU0sSUFBSSxHQUFHLENBQUMsTUFBTSxJQUFJLFVBQVUsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUM7WUFBRSxPQUFPLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxJQUFJLE9BQU8sQ0FBQTtRQUMxRyxJQUFJLFVBQVUsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQztZQUFFLE9BQU8sR0FBRyxHQUFHLENBQUMsSUFBSSxPQUFPLENBQUE7UUFDdkQsT0FBTyxJQUFJLENBQUE7SUFDYixDQUFDO0lBRUQsMEVBQTBFO0lBQzFFLGdGQUFnRjtJQUNoRixTQUFTLGlCQUFpQixDQUFDLENBQU87UUFDaEMsSUFBSSxDQUFDLENBQUMsQ0FBQyxLQUFLLEdBQUcsRUFBRSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDO1lBQUUsT0FBTyxLQUFLLENBQUE7UUFDdkQsSUFBSyxDQUFxQyxDQUFDLFdBQVcsR0FBRyxFQUFFLENBQUMsV0FBVyxDQUFDLFNBQVMsRUFBRSxDQUFDO1lBQ2xGLE1BQU0sR0FBRyxHQUFHLENBQUMsQ0FBQyxNQUE2QixDQUFBO1lBQzNDLDRFQUE0RTtZQUM1RSxPQUFPLENBQUMsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssR0FBRyxDQUFDLEVBQUUsQ0FBQyxXQUFXLENBQUMsV0FBVyxHQUFHLEVBQUUsQ0FBQyxXQUFXLENBQUMsYUFBYSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUE7UUFDaEcsQ0FBQztRQUNELE9BQU8sS0FBSyxDQUFBO0lBQ2QsQ0FBQztJQUVELDhFQUE4RTtJQUM5RSx3REFBd0Q7SUFDeEQsU0FBUyxTQUFTLENBQUMsQ0FBUztRQUMxQixPQUFPLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQTtJQUN0QyxDQUFDO0lBRUQsU0FBUyxLQUFLLENBQUMsQ0FBTyxFQUFFLE1BQVksRUFBRSxJQUF3QjtRQUM1RCxJQUFJLElBQUksS0FBSyxTQUFTLEVBQUUsQ0FBQztZQUN2QixNQUFNLEVBQUUsR0FBRyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsQ0FBQTtZQUM5QixJQUFJLEVBQUU7Z0JBQUUsT0FBTyxFQUFFLENBQUE7UUFDbkIsQ0FBQzthQUFNLENBQUM7WUFDTixNQUFNLEVBQUUsR0FBRyxhQUFhLENBQUMsQ0FBQyxDQUFDLENBQUE7WUFDM0IsSUFBSSxFQUFFO2dCQUFFLE9BQU8sRUFBRSxDQUFBO1FBQ25CLENBQUM7UUFDRCxRQUFRO1FBQ1IsSUFBSSxDQUFDLENBQUMsT0FBTyxFQUFFO1lBQUUsT0FBTyxDQUFDLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxNQUFNLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUE7UUFDOUUsdURBQXVEO1FBQ3ZELElBQUksT0FBTyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO1lBQzNCLE1BQU0sTUFBTSxHQUFJLENBQTZDLENBQUMsTUFBTSxDQUFBO1lBQ3BFLE1BQU0sSUFBSSxHQUFHLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQyxDQUF1QyxDQUFDLENBQUE7WUFDOUUsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRTtnQkFDOUIsTUFBTSxJQUFJLEdBQUcsTUFBTSxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUUsQ0FBQTtnQkFDcEMsTUFBTSxNQUFNLEdBQUcsQ0FBQyxJQUFJLEdBQUcsRUFBRSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUE7Z0JBQ2xELE1BQU0sS0FBSyxHQUFHLENBQUMsSUFBSSxHQUFHLEVBQUUsQ0FBQyxZQUFZLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFBO2dCQUNyRCxNQUFNLEVBQUUsR0FBRyxLQUFLLENBQUMsQ0FBQyxFQUFFLE1BQU0sRUFBRSxJQUFJLENBQUMsQ0FBQTtnQkFDakMsT0FBTyxNQUFNLENBQUMsQ0FBQyxDQUFDLE1BQU0sU0FBUyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEdBQUcsRUFBRSxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQTtZQUN0RSxDQUFDLENBQUMsQ0FBQTtZQUNGLE9BQU8sYUFBYSxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUE7UUFDekMsQ0FBQztRQUNELFFBQVE7UUFDUixJQUFJLE9BQU8sQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztZQUMzQixNQUFNLEVBQUUsR0FBRyxLQUFLLENBQUMsT0FBTyxDQUFDLGdCQUFnQixDQUFDLENBQXVDLENBQUMsQ0FBQyxDQUFDLENBQUUsRUFBRSxNQUFNLEVBQUUsSUFBSSxDQUFDLENBQUE7WUFDckcsT0FBTyxZQUFZLFNBQVMsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFBO1FBQ3RDLENBQUM7UUFDRCxxRkFBcUY7UUFDckYsSUFBSSxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO1lBQ3pCLE1BQU0sS0FBSyxHQUFHLENBQUMsQ0FBQyxhQUFhLEVBQUUsQ0FBQTtZQUMvQixJQUFJLEtBQUssQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7Z0JBQ3JCLE1BQU0sS0FBSyxHQUFHLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRTtvQkFDNUIsTUFBTSxFQUFFLEdBQUcsT0FBTyxDQUFDLHlCQUF5QixDQUFDLENBQUMsRUFBRSxNQUFNLENBQUMsQ0FBQTtvQkFDdkQsTUFBTSxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsS0FBSyxHQUFHLEVBQUUsQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQTtvQkFDaEUsT0FBTyxZQUFZLE9BQU8sQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsR0FBRyxLQUFLLEtBQUssQ0FBQyxFQUFFLEVBQUUsTUFBTSxFQUFFLElBQUksQ0FBQyxFQUFFLENBQUE7Z0JBQ3hFLENBQUMsQ0FBQyxDQUFBO2dCQUNGLE9BQU8sS0FBSyxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUE7WUFDbEMsQ0FBQztRQUNILENBQUM7UUFDRCxtRUFBbUU7UUFDbkUsTUFBTSxPQUFPLEdBQUcsT0FBTyxDQUFDLFlBQVksQ0FBQyxDQUFDLEVBQUUsTUFBTSxFQUFFLEVBQUUsQ0FBQyxDQUFBO1FBQ25ELGlGQUFpRjtRQUNqRixpRkFBaUY7UUFDakYsSUFBSSxJQUFJLEtBQUssTUFBTTtZQUFFLE9BQU8sV0FBVyxDQUFDLE9BQU8sQ0FBQyxDQUFBO1FBQ2hELE9BQU8sT0FBTyxDQUFBO0lBQ2hCLENBQUM7SUFFRCxxRkFBcUY7SUFDckYsU0FBUyxXQUFXLENBQUMsQ0FBUztRQUM1QixNQUFNLENBQUMsR0FBRyxrQ0FBa0MsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUE7UUFDcEQsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFBO0lBQ3RCLENBQUM7SUFFRCxPQUFPO1FBQ0wsaUdBQWlHO1FBQ2pHLE1BQU0sQ0FBQyxVQUFnQixFQUFFLEdBQXVCLEVBQUUsTUFBWTtZQUM1RCxNQUFNLFNBQVMsR0FBRyxPQUFPLENBQUMsaUJBQWlCLENBQUMsVUFBVSxFQUFFLEdBQUcsQ0FBQyxDQUFBO1lBQzVELElBQUksQ0FBQyxTQUFTO2dCQUFFLE9BQU8sSUFBSSxDQUFBO1lBQzNCLE1BQU0sVUFBVSxHQUFHLE9BQU8sQ0FBQyx5QkFBeUIsQ0FBQyxTQUFTLEVBQUUsTUFBTSxDQUFDLENBQUE7WUFDdkUsTUFBTSxLQUFLLEdBQUcsVUFBVSxDQUFDLGFBQWEsRUFBRSxDQUFBO1lBQ3hDLElBQUksS0FBSyxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztnQkFDdkIsb0ZBQW9GO2dCQUNwRixPQUFPLFdBQVcsT0FBTyxDQUFDLFlBQVksQ0FBQyxVQUFVLEVBQUUsTUFBTSxFQUFFLEVBQUUsQ0FBQyxLQUFLLENBQUE7WUFDckUsQ0FBQztZQUNELE1BQU0sSUFBSSxHQUFHLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRTtnQkFDM0IsTUFBTSxFQUFFLEdBQUcsT0FBTyxDQUFDLHlCQUF5QixDQUFDLENBQUMsRUFBRSxNQUFNLENBQUMsQ0FBQTtnQkFDdkQsTUFBTSxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsS0FBSyxHQUFHLEVBQUUsQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQTtnQkFDaEUsT0FBTyxnQkFBZ0IsT0FBTyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxHQUFHLEtBQUssS0FBSyxDQUFDLEVBQUUsRUFBRSxNQUFNLEVBQUUsR0FBRyxDQUFDLEVBQUUsQ0FBQTtZQUMzRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUE7WUFDYixPQUFPLE1BQU0sSUFBSSxPQUFPLENBQUE7UUFDMUIsQ0FBQztRQUVEOzs7O1dBSUc7UUFDSCxVQUFVLENBQUMsVUFBZ0IsRUFBRSxNQUFZO1lBQ3ZDLE1BQU0sT0FBTyxHQUFHLE9BQU8sQ0FBQyxpQkFBaUIsQ0FBQyxVQUFVLEVBQUUsZUFBZSxDQUFDLENBQUE7WUFDdEUsTUFBTSxPQUFPLEdBQUcsT0FBTyxDQUFDLGlCQUFpQixDQUFDLFVBQVUsRUFBRSxNQUFNLENBQUMsQ0FBQTtZQUM3RCxJQUFJLENBQUMsT0FBTyxJQUFJLENBQUMsT0FBTztnQkFBRSxPQUFPLElBQUksQ0FBQTtZQUNyQyxNQUFNLFFBQVEsR0FBRyxPQUFPLENBQUMseUJBQXlCLENBQUMsT0FBTyxFQUFFLE1BQU0sQ0FBQyxDQUFBO1lBQ25FLE1BQU0sUUFBUSxHQUFHLE9BQU8sQ0FBQyx5QkFBeUIsQ0FBQyxPQUFPLEVBQUUsTUFBTSxDQUFDLENBQUE7WUFDbkUsTUFBTSxTQUFTLEdBQUcsUUFBUSxDQUFDLGFBQWEsRUFBRSxDQUFBO1lBQzFDLElBQUksU0FBUyxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztnQkFDM0IsT0FBTyxXQUFXLE9BQU8sQ0FBQyxZQUFZLENBQUMsUUFBUSxFQUFFLE1BQU0sRUFBRSxFQUFFLENBQUMsS0FBSyxDQUFBO1lBQ25FLENBQUM7WUFDRCxNQUFNLFVBQVUsR0FBRyxJQUFJLEdBQUcsQ0FBQyxRQUFRLENBQUMsYUFBYSxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFVLENBQUMsQ0FBQyxDQUFBO1lBQ3JGLE1BQU0sSUFBSSxHQUFHLFNBQVMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRTs7Z0JBQy9CLE1BQU0sR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDLEtBQUssR0FBRyxFQUFFLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUE7Z0JBQ2hFLE1BQU0sTUFBTSxTQUFHLFVBQVUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxtQ0FBSSxDQUFDLENBQUE7Z0JBQzFDLE1BQU0sT0FBTyxHQUFHLEtBQUssQ0FBQyxPQUFPLENBQUMseUJBQXlCLENBQUMsTUFBTSxFQUFFLE1BQU0sQ0FBQyxFQUFFLE1BQU0sRUFBRSxNQUFNLENBQUMsQ0FBQTtnQkFDeEYscUZBQXFGO2dCQUNyRixNQUFNLEtBQUssR0FBRyxPQUFPLENBQUMsT0FBTyxDQUFDLFdBQVcsRUFBRSxPQUFPLENBQUMsQ0FBQTtnQkFDbkQsT0FBTyxnQkFBZ0IsT0FBTyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxHQUFHLEtBQUssS0FBSyxFQUFFLENBQUE7WUFDMUQsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFBO1lBQ2IsT0FBTyxNQUFNLElBQUksT0FBTyxDQUFBO1FBQzFCLENBQUM7S0FDRixDQUFBO0lBRUQsU0FBUyxPQUFPLENBQUMsSUFBWTtRQUMzQixPQUFPLDRCQUE0QixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFBO0lBQzlFLENBQUM7QUFDSCxDQUFDIn0=