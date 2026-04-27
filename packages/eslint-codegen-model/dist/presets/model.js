import * as fs from "fs";
import { normaliseModule } from "../normalise.js";
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
export const model = ({ meta }) => {
    try {
        const targetContent = fs.readFileSync(meta.filename).toString();
        const processed = [];
        const sourcePath = meta.filename;
        if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
            throw Error(`Source path is not a file: ${sourcePath}`);
        }
        const them = [];
        for (const modelName of getExportedModelNames(targetContent)) {
            if (processed.includes(modelName))
                continue;
            processed.push(modelName);
            them.push([
                `export namespace ${modelName} {`,
                `  export interface Encoded extends S.Struct.Encoded<typeof ${modelName}["fields"]> {}`,
                "}"
            ]);
        }
        const expectedContent = [
            "//",
            `/* eslint-disable */`,
            ...them.flat().filter((x) => !!x),
            `/* eslint-enable */`,
            "//"
        ]
            .join("\n");
        // do not re-emit in a different style, or a loop will occur
        if (normaliseModule(meta.existingContent, meta.filename)
            === normaliseModule(expectedContent, meta.filename)) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9kZWwuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvcHJlc2V0cy9tb2RlbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFFQSxPQUFPLEtBQUssRUFBRSxNQUFNLElBQUksQ0FBQTtBQUN4QixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0saUJBQWlCLENBQUE7QUFFakQsZ0ZBQWdGO0FBQ2hGLGtGQUFrRjtBQUNsRixnRUFBZ0U7QUFDaEUsa0ZBQWtGO0FBQ2xGLHFGQUFxRjtBQUNyRix3RUFBd0U7QUFDeEUsTUFBTSxzQkFBc0IsR0FBRyxpRkFBaUYsQ0FBQTtBQUNoSCxNQUFNLG1CQUFtQixHQUFHLHNDQUFzQyxDQUFBO0FBQ2xFLE1BQU0sZUFBZSxHQUFHLHNDQUFzQyxDQUFBO0FBRTlELFNBQVMscUJBQXFCLENBQUMsSUFBWTs7SUFDekMsTUFBTSxNQUFNLEdBQWtCLEVBQUUsQ0FBQTtJQUNoQyxNQUFNLE9BQU8sR0FBRyxrQ0FBa0MsQ0FBQTtJQUNsRCxNQUFNLE9BQU8sR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQTtJQUNsRCxLQUFLLE1BQU0sQ0FBQyxLQUFLLEVBQUUsS0FBSyxDQUFDLElBQUksT0FBTyxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUM7UUFDL0MsTUFBTSxJQUFJLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBRSxDQUFBO1FBQ3RCLE1BQU0sS0FBSyxHQUFHLEtBQUssQ0FBQyxLQUFNLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBRSxDQUFDLE1BQU0sQ0FBQTtRQUM3QywwRUFBMEU7UUFDMUUsdUVBQXVFO1FBQ3ZFLE1BQU0sU0FBUyxHQUFHLE1BQUEsT0FBTyxDQUFDLEtBQUssR0FBRyxDQUFDLENBQUMsMENBQUUsS0FBSyxDQUFBO1FBQzNDLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxFQUFFLFNBQVMsS0FB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