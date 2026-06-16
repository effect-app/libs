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
            || opaqueFacadeRe.test(extendsWindow)) {
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
    for (const decl of [`class _${name}`, `export class ${name}`, `class ${name}`]) {
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
function normaliseLines(s) {
    return s.split("\n").map((l) => l.trim()).filter(Boolean).join("\n");
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
        if ((options === null || options === void 0 ? void 0 : options.static) || (options === null || options === void 0 ? void 0 : options.facade)) {
            if (!resolver) {
                // No type checker available (e.g. oxlint). Leave the block as-is so we don't
                // clobber CLI-generated static interfaces with the conditional form.
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