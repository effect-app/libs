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
            const block = resolver.generate(meta.filename, modelNames, {
                facade: (_a = options.facade) !== null && _a !== void 0 ? _a : false,
                make: options.facade || ((_b = options.make) !== null && _b !== void 0 ? _b : false),
                type: options.facade || options.type || options.make || false
            });
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9kZWwuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvcHJlc2V0cy9tb2RlbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEtBQUssRUFBRSxNQUFNLElBQUksQ0FBQTtBQUd4QixnRkFBZ0Y7QUFDaEYsa0ZBQWtGO0FBQ2xGLGdFQUFnRTtBQUNoRSxrRkFBa0Y7QUFDbEYscUZBQXFGO0FBQ3JGLHdFQUF3RTtBQUN4RSxNQUFNLHNCQUFzQixHQUFHLGlGQUFpRixDQUFBO0FBQ2hILE1BQU0sbUJBQW1CLEdBQUcsc0NBQXNDLENBQUE7QUFDbEUsTUFBTSxjQUFjLEdBQUcsdUNBQXVDLENBQUE7QUFDOUQsTUFBTSxlQUFlLEdBQUcsc0NBQXNDLENBQUE7QUFFOUQsTUFBTSxVQUFVLHFCQUFxQixDQUFDLElBQVk7O0lBQ2hELE1BQU0sTUFBTSxHQUFrQixFQUFFLENBQUE7SUFDaEMsTUFBTSxHQUFHLEdBQUcsQ0FBQyxJQUFZLEVBQUUsRUFBRTtRQUMzQixJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUM7WUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFBO0lBQy9DLENBQUMsQ0FBQTtJQUNELE1BQU0sT0FBTyxHQUFHLGtDQUFrQyxDQUFBO0lBQ2xELE1BQU0sT0FBTyxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFBO0lBQ2xELEtBQUssTUFBTSxDQUFDLEtBQUssRUFBRSxLQUFLLENBQUMsSUFBSSxPQUFPLENBQUMsT0FBTyxFQUFFLEVBQUUsQ0FBQztRQUMvQyxNQUFNLElBQUksR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFFLENBQUE7UUFDdEIsTUFBTSxLQUFLLEdBQUcsS0FBSyxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFFLENBQUMsTUFBTSxDQUFBO1FBQzVDLDBFQUEwRTtRQUMxRSx1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