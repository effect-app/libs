import * as fs from "fs";
// Detects `export class Foo` whose extends clause contains e.g. `Class<Foo,` or
// `S.TaggedClass<Foo,` — the second generic signals an Encoded override and marks
// this class as a model that needs a generated namespace block.
// We look at the text from `export class` up to the opening `{` of the class body
// (stopping at the next `export class` boundary) so the pattern works for multi-line
// extends expressions without bleeding into the next class declaration.
const baseClassWithEncodedRe = /(?:^|[\s.])(?:Class|TaggedClass|ErrorClass|TaggedErrorClass)\s*<\s*\w[\w.]*\s*,/;
const opaqueWithEncodedRe = /(?:^|[\s.])Opaque\s*<\s*\w[\w.]*\s*,/;
const opaqueFacadeRe = /(?:^|[\s.])OpaqueFacade(?:Class)?\s*</;
const contextOpaqueRe = /(?:^|[\s.])Context\s*\.\s*Opaque\s*</;
export function getExportedModelNames(code) {
    var _a;
    const result = [];
    const add = (name) => {
        if (!result.includes(name))
            result.push(name);
    };
    const classRe = /(^|\n)\s*export\s+class\s+(\w+)/g;
    const matches = Array.from(code.matchAll(classRe));
    for (const [index, match] of matches.entries()) {
        const name = match[2];
        const start = match.index + match[1].length;
        // Take up to the next `export class` or 500 chars, whichever comes first,
        // then trim further to only the extends clause (before the first `{`).
        const nextClass = (_a = matches[index + 1]) === null || _a === void 0 ? void 0 : _a.index;
        const rawWindow = code.slice(start, nextClass === undefined ? start + 500 : nextClass);
        // Only look at the part before the class body opens.
        const braceIdx = rawWindow.indexOf("{");
        const extendsWindow = braceIdx === -1 ? rawWindow : rawWindow.slice(0, braceIdx);
        if (baseClassWithEncodedRe.test(extendsWindow)
            || (opaqueWithEncodedRe.test(extendsWindow) && !contextOpaqueRe.test(extendsWindow))
            || opaqueFacadeRe.test(extendsWindow)
            // base mode: `export class X extends __X` (facade lives on the generated `__X`)
            || new RegExp(`extends\\s+__${name}\\b`).test(extendsWindow)) {
            add(name);
        }
    }
    const facadeRe = /(^|\n)\s*export\s+const\s+(\w+)\s*:\s*\2\.Schema\s*=/g;
    for (const match of code.matchAll(facadeRe)) {
        add(match[2]);
    }
    return result;
}
// The extends-clause text of a model's defining class — checks the private `_X`
// (post-rewrite) first, then the exported `X` (pre-rewrite / already-facade).
function modelExtendsWindow(code, name) {
    // `class __X` first: base mode (`export class X extends __X`) where the facade
    // lives on the generated base `class __X extends OpaqueFacadeClass<...>()(_X)`.
    for (const decl of [`class __${name}`, `class _${name}`, `export class ${name}`, `class ${name}`]) {
        const re = new RegExp(`(^|\\n)\\s*${decl.replace(/[$]/g, "\\$&")}\\b`);
        const m = re.exec(code);
        if (!m)
            continue;
        const start = m.index + m[1].length;
        const window = code.slice(start, start + 500);
        const braceIdx = window.indexOf("{");
        return braceIdx === -1 ? window : window.slice(0, braceIdx);
    }
    return null;
}
// Models that can be turned into a shallow facade: those whose underlying schema
// is `S.Opaque(...)` (or already an `OpaqueFacade`). `Class`/`TaggedClass`/etc.
// models are nominal (and may carry instance methods) — leave them standard.
export function getFacadeableModelNames(code) {
    return getExportedModelNames(code).filter((name) => {
        const w = modelExtendsWindow(code, name);
        if (w === null)
            return false;
        if (baseClassWithEncodedRe.test(w))
            return false;
        return opaqueFacadeRe.test(w) || (/(?:^|[\s.])Opaque\s*</.test(w) && !contextOpaqueRe.test(w));
    });
}
// Whitespace/format-insensitive canonical form, so a dprint-reformatted block
// compares equal to the freshly-generated one (otherwise codegen and the
// formatter oscillate forever). Beyond per-line trimming this also absorbs the
// reformattings dprint applies to generated types:
//   - line-wrapping (a long union split onto `\n  | A\n  | B` vs one line),
//   - the leading union/intersection bar dprint adds when wrapping,
//   - the trailing `;` inside an inline object literal that dprint strips.
// It only removes insignificant separators/whitespace, so genuine content
// differences (a renamed type, `S.X` vs `X`, a changed member) still differ.
function normaliseLines(s) {
    return s
        .replace(/\s+/g, "") // collapse all whitespace incl. newlines/indentation
        .replace(/;/g, "") // object-member separators: native emits `{ a; b }`, dprint multilines to `{\n a\n b\n}` (no `;`)
        .replace(/([:=<(,[|&])\|/g, "$1"); // leading `|`/`&` bar after a separator (dprint wrap style)
}
export function model({ meta, options }, context, resolver) {
    var _a, _b;
    try {
        const targetContent = typeof context === "string" && context.length > 0
            ? context
            : fs.readFileSync(meta.filename).toString();
        const modelNames = [];
        const seen = new Set();
        for (const modelName of getExportedModelNames(targetContent)) {
            if (seen.has(modelName))
                continue;
            seen.add(modelName);
            modelNames.push(modelName);
        }
        let expectedContent;
        // Any facade option (static/type/make/facade) needs the type checker. Without a
        // resolver (e.g. the oxlint rule, no checker) leave the block untouched so we never
        // revert CLI-generated static Encoded/Type/Make interfaces to the conditional form.
        const needsResolver = !!((options === null || options === void 0 ? void 0 : options.static) || (options === null || options === void 0 ? void 0 : options.type) || (options === null || options === void 0 ? void 0 : options.make) || (options === null || options === void 0 ? void 0 : options.facade));
        if (needsResolver) {
            if (!resolver) {
                return meta.existingContent;
            }
            // In facade mode, only Opaque-struct models become facades; Class-based
            // models (nominal, may carry methods) keep the standard namespace so a
            // mixed file still converts its facade-able models.
            const facadeable = options.facade ? new Set(getFacadeableModelNames(targetContent)) : null;
            const resolveNames = facadeable ? modelNames.filter((n) => facadeable.has(n)) : modelNames;
            const standardNames = facadeable ? modelNames.filter((n) => !facadeable.has(n)) : [];
            const block = resolveNames.length > 0
                ? resolver.generate(meta.filename, resolveNames, {
                    facade: (_a = options.facade) !== null && _a !== void 0 ? _a : false,
                    make: options.facade || ((_b = options.make) !== null && _b !== void 0 ? _b : false),
                    type: options.facade || options.type || options.make || false
                })
                : "";
            if (block === null) {
                // Could not resolve (file outside program, etc.) — leave existing content.
                return meta.existingContent;
            }
            const standardBlock = standardNames.map((n) => `export namespace ${n} {\n  export interface Encoded extends S.StructNestedEncoded<typeof ${n}> {}\n}`).join("\n");
            expectedContent = ["//", [block, standardBlock].filter((s) => s.length > 0).join("\n"), "//"].join("\n");
        }
        else {
            const them = modelNames.map((modelName) => [
                `export namespace ${modelName} {`,
                `  export interface Encoded extends S.StructNestedEncoded<typeof ${modelName}> {}`,
                "}"
            ]);
            expectedContent = ["//", ...them.flat(), "//"].join("\n");
        }
        // Fast path: whitespace-normalised comparison (avoids AST parse)
        if (normaliseLines(meta.existingContent) === normaliseLines(expectedContent)) {
            return meta.existingContent;
        }
        return expectedContent;
    }
    catch (e) {
        return ("/** Got exception: "
            + ("stack" in e ? e.stack : "")
            + JSON.stringify(e)
            + "*/");
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9kZWwuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvcHJlc2V0cy9tb2RlbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEtBQUssRUFBRSxNQUFNLElBQUksQ0FBQTtBQUd4QixnRkFBZ0Y7QUFDaEYsa0ZBQWtGO0FBQ2xGLGdFQUFnRTtBQUNoRSxrRkFBa0Y7QUFDbEYscUZBQXFGO0FBQ3JGLHdFQUF3RTtBQUN4RSxNQUFNLHNCQUFzQixHQUFHLGlGQUFpRixDQUFBO0FBQ2hILE1BQU0sbUJBQW1CLEdBQUcsc0NBQXNDLENBQUE7QUFDbEUsTUFBTSxjQUFjLEdBQUcsdUNBQXVDLENBQUE7QUFDOUQsTUFBTSxlQUFlLEdBQUcsc0NBQXNDLENBQUE7QUFFOUQsTUFBTSxVQUFVLHFCQUFxQixDQUFDLElBQVk7O0lBQ2hELE1BQU0sTUFBTSxHQUFrQixFQUFFLENBQUE7SUFDaEMsTUFBTSxHQUFHLEdBQUcsQ0FBQyxJQUFZLEVBQUUsRUFBRTtRQUMzQixJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUM7WUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFBO0lBQy9DLENBQUMsQ0FBQTtJQUNELE1BQU0sT0FBTyxHQUFHLGtDQUFrQyxDQUFBO0lBQ2xELE1BQU0sT0FBTyxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFBO0lBQ2xELEtBQUssTUFBTSxDQUFDLEtBQUssRUFBRSxLQUFLLENBQUMsSUFBSSxPQUFPLENBQUMsT0FBTyxFQUFFLEVBQUUsQ0FBQztRQUMvQyxNQUFNLElBQUksR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFFLENBQUE7UUFDdEIsTUFBTSxLQUFLLEdBQUcsS0FBSyxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFFLENBQUMsTUFBTSxDQUFBO1FBQzVDLDBFQUEwRTtRQUMxRSx1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