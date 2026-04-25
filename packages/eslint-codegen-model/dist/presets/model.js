"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.model = void 0;
/* eslint-disable @typescript-eslint/no-explicit-any */
const generator_1 = __importDefault(require("@babel/generator"));
const parser_1 = require("@babel/parser");
const fs = __importStar(require("fs"));
function parseModule(code) {
    return (0, parser_1.parse)(code, { sourceType: "module", plugins: ["typescript"] });
}
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
function normalise(str) {
    try {
        return (0, generator_1.default)(parseModule(str))
            .code;
        // .replace(/'/g, `"`)
        // .replace(/\/index/g, "")
        // .replace(/([\n\s]+ \|)/g, " |").replaceAll(": |", ":")
        // .replaceAll(/[\s\n]+\|/g, " |")
        // .replaceAll("\n", ";")
        // .replaceAll(" ", "")
        // TODO: remove all \n and whitespace?
    }
    catch (e) {
        return str;
    }
}
const model = ({ meta }) => {
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
        if (normalise(meta.existingContent) === normalise(expectedContent)) {
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
exports.model = model;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9kZWwuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvcHJlc2V0cy9tb2RlbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSx1REFBdUQ7QUFDdkQsaUVBQXVDO0FBQ3ZDLDBDQUFxQztBQUVyQyxNQUFZLEVBQUUsK0JBQVU7QUFFeEIsU0FBUyxXQUFXLENBQUMsSUFBWTtJQUMvQixPQUFPLElBQUEsY0FBSyxFQUFDLElBQUksRUFBRSxFQUFFLFVBQVUsRUFBRSxRQUFRLEVBQUUsT0FBTyxFQUFFLENBQUMsWUFBWSxDQUFDLEVBQUUsQ0FBUSxDQUFBO0FBQzlFLENBQUM7QUFFRCxnRkFBZ0Y7QUFDaEYsa0ZBQWtGO0FBQ2xGLGdFQUFnRTtBQUNoRSxrRkFBa0Y7QUFDbEYscUZBQXFGO0FBQ3JGLHdFQUF3RTtBQUN4RSxNQUFNLHNCQUFzQixHQUFHLGlGQUFpRixDQUFBO0FBQ2hILE1BQU0sbUJBQW1CLEdBQUcsc0NBQXNDLENBQUE7QUFDbEUsTUFBTSxlQUFlLEdBQUcsc0NBQXNDLENBQUE7QUFFOUQsU0FBUyxxQkFBcUIsQ0FBQyxJQUFZOztJQUN6QyxNQUFNLE1BQU0sR0FBa0IsRUFBRSxDQUFBO0lBQ2hDLE1BQU0sT0FBTyxHQUFHLGtDQUFrQyxDQUFBO0lBQ2xELE1BQU0sT0FBTyxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFBO0lBQ2xELEtBQUssTUFBTSxDQUFDLEtBQUssRUFBRSxLQUFLLENBQUMsSUFBSSxPQUFPLENBQUMsT0FBTyxFQUFFLEVBQUUsQ0FBQztRQUMvQyxNQUFNLElBQUksR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFFLENBQUE7UUFDdEIsTUFBTSxLQUFLLEdBQUcsS0FBSyxDQUFDLEtBQU0sR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFFLENBQUMsTUFBTSxDQUFB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