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
function getExportedModelNames(code) {
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
export const model = ({ meta }, context) => {
    try {
        const targetContent = typeof context === "string" && context.length > 0
            ? context
            : fs.readFileSync(meta.filename).toString();
        const processed = new Set();
        const them = [];
        for (const modelName of getExportedModelNames(targetContent)) {
            if (processed.has(modelName))
                continue;
            processed.add(modelName);
            them.push([
                `export namespace ${modelName} {`,
                `  export interface Encoded extends S.StructNestedEncoded<typeof ${modelName}> {}`,
                "}"
            ]);
        }
        const expectedContent = [
            "//",
            ...them.flat().filter((x) => !!x),
            "//"
        ]
            .join("\n");
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
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9kZWwuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvcHJlc2V0cy9tb2RlbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEtBQUssRUFBRSxNQUFNLElBQUksQ0FBQTtBQU94QixnRkFBZ0Y7QUFDaEYsa0ZBQWtGO0FBQ2xGLGdFQUFnRTtBQUNoRSxrRkFBa0Y7QUFDbEYscUZBQXFGO0FBQ3JGLHdFQUF3RTtBQUN4RSxNQUFNLHNCQUFzQixHQUFHLGlGQUFpRixDQUFBO0FBQ2hILE1BQU0sbUJBQW1CLEdBQUcsc0NBQXNDLENBQUE7QUFDbEUsTUFBTSxlQUFlLEdBQUcsc0NBQXNDLENBQUE7QUFFOUQsU0FBUyxxQkFBcUIsQ0FBQyxJQUFZOztJQUN6QyxNQUFNLE1BQU0sR0FBa0IsRUFBRSxDQUFBO0lBQ2hDLE1BQU0sT0FBTyxHQUFHLGtDQUFrQyxDQUFBO0lBQ2xELE1BQU0sT0FBTyxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFBO0lBQ2xELEtBQUssTUFBTSxDQUFDLEtBQUssRUFBRSxLQUFLLENBQUMsSUFBSSxPQUFPLENBQUMsT0FBTyxFQUFFLEVBQUUsQ0FBQztRQUMvQyxNQUFNLElBQUksR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFFLENBQUE7UUFDdEIsTUFBTSxLQUFLLEdBQUcsS0FBSyxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFFLENBQUMsTUFBTSxDQUFBO1FBQzVDLDBFQUEwRTtRQUMxRSx1RUFBdUU7UUFDdkUsTUFBTSxTQUFTLEdBQUcsTUFBQSxPQUFPLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQywwQ0FBRSxLQUFLLENBQUE7UUFDM0MsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLEVBQUUsU0FBUyxLQUFLLFNBQVMsQ0FBQyxDQUFDLENBQUMsS0FBSyxHQUFHLEdBQUcsQ0FBQyxD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