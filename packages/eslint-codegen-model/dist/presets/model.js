import * as fs from "fs";
// Detects `export class Foo` whose extends clause contains e.g. `Class<Foo,` or
// `S.TaggedClass<Foo,` — the second generic signals an Encoded override and marks
// this class as a model that needs a generated namespace block.
// We look at the text from `export class` up to the opening `{` of the class body
// (stopping at the next `export class` boundary) so the pattern works for multi-line
// extends expressions without bleeding into the next class declaration.
const baseClassWithEncodedRe = /(?:^|[\s.])(?:Class|TaggedClass|ErrorClass|TaggedErrorClass)\s*<\s*\w[\w.]*\s*,/;
const opaqueWithEncodedRe = /(?:^|[\s.])Opaque\s*<\s*\w[\w.]*\s*,/;
const contextOpaqueRe = /(?:^|[\s.])Context\s*\.\s*Opaque\s*</;
export function getExportedModelNames(code) {
    var _a;
    const result = [];
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
            || (opaqueWithEncodedRe.test(extendsWindow) && !contextOpaqueRe.test(extendsWindow))) {
            result.push(name);
        }
    }
    return result;
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
        if (options === null || options === void 0 ? void 0 : options.static) {
            if (!resolver) {
                // No type checker available (e.g. oxlint). Leave the block as-is so we don't
                // clobber CLI-generated static interfaces with the conditional form.
                return meta.existingContent;
            }
            const block = resolver.generate(meta.filename, modelNames, { type: (_a = options.type) !== null && _a !== void 0 ? _a : false, make: (_b = options.make) !== null && _b !== void 0 ? _b : false });
            if (block === null) {
                // Could not resolve (file outside program, etc.) — leave existing content.
                return meta.existingContent;
            }
            expectedContent = ["//", block, "//"].join("\n");
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9kZWwuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvcHJlc2V0cy9tb2RlbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEtBQUssRUFBRSxNQUFNLElBQUksQ0FBQTtBQUd4QixnRkFBZ0Y7QUFDaEYsa0ZBQWtGO0FBQ2xGLGdFQUFnRTtBQUNoRSxrRkFBa0Y7QUFDbEYscUZBQXFGO0FBQ3JGLHdFQUF3RTtBQUN4RSxNQUFNLHNCQUFzQixHQUFHLGlGQUFpRixDQUFBO0FBQ2hILE1BQU0sbUJBQW1CLEdBQUcsc0NBQXNDLENBQUE7QUFDbEUsTUFBTSxlQUFlLEdBQUcsc0NBQXNDLENBQUE7QUFFOUQsTUFBTSxVQUFVLHFCQUFxQixDQUFDLElBQVk7O0lBQ2hELE1BQU0sTUFBTSxHQUFrQixFQUFFLENBQUE7SUFDaEMsTUFBTSxPQUFPLEdBQUcsa0NBQWtDLENBQUE7SUFDbEQsTUFBTSxPQUFPLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUE7SUFDbEQsS0FBSyxNQUFNLENBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQyxJQUFJLE9BQU8sQ0FBQyxPQUFPLEVBQUUsRUFBRSxDQUFDO1FBQy9DLE1BQU0sSUFBSSxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUUsQ0FBQTtRQUN0QixNQUFNLEtBQUssR0FBRyxLQUFLLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUUsQ0FBQyxNQUFNLENBQUE7UUFDNUMsMEVBQTBFO1FBQzFFLHVFQUF1RTtRQUN2RSxNQUFNLFNBQVMsR0FBRyxNQUFBLE9BQU8sQ0FBQyxLQUFLLEdBQUcsQ0FBQyxDQUFDLDBDQUFFLEtBQUssQ0FBQTtRQUMzQyxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssRUFBRSxTQUFTLEtBQUssU0FBUyxDQUFDLENBQUMsQ0FBQyxLQUFLLEdBQUcsR0FBRyxD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