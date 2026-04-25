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
function getExportedModelNames(code) {
    const result = [];
    const classRe = /\bexport\s+class\s+(\w+)/g;
    let match;
    while ((match = classRe.exec(code)) !== null) {
        const name = match[1];
        // Take up to the next `export class` or 500 chars, whichever comes first,
        // then trim further to only the extends clause (before the first `{`).
        const nextClass = code.indexOf("export class", match.index + 1);
        const rawWindow = code.slice(match.index, nextClass === -1 ? match.index + 500 : nextClass);
        // Only look at the part before the class body opens.
        const braceIdx = rawWindow.indexOf("{");
        const extendsWindow = braceIdx === -1 ? rawWindow : rawWindow.slice(0, braceIdx);
        if (baseClassWithEncodedRe.test(extendsWindow)) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9kZWwuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvcHJlc2V0cy9tb2RlbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSx1REFBdUQ7QUFDdkQsaUVBQXVDO0FBQ3ZDLDBDQUFxQztBQUVyQyxNQUFZLEVBQUUsK0JBQVU7QUFFeEIsU0FBUyxXQUFXLENBQUMsSUFBWTtJQUMvQixPQUFPLElBQUEsY0FBSyxFQUFDLElBQUksRUFBRSxFQUFFLFVBQVUsRUFBRSxRQUFRLEVBQUUsT0FBTyxFQUFFLENBQUMsWUFBWSxDQUFDLEVBQUUsQ0FBUSxDQUFBO0FBQzlFLENBQUM7QUFFRCxnRkFBZ0Y7QUFDaEYsa0ZBQWtGO0FBQ2xGLGdFQUFnRTtBQUNoRSxrRkFBa0Y7QUFDbEYscUZBQXFGO0FBQ3JGLHdFQUF3RTtBQUN4RSxNQUFNLHNCQUFzQixHQUFHLGlGQUFpRixDQUFBO0FBRWhILFNBQVMscUJBQXFCLENBQUMsSUFBWTtJQUN6QyxNQUFNLE1BQU0sR0FBa0IsRUFBRSxDQUFBO0lBQ2hDLE1BQU0sT0FBTyxHQUFHLDJCQUEyQixDQUFBO0lBQzNDLElBQUksS0FBNkIsQ0FBQTtJQUNqQyxPQUFPLENBQUMsS0FBSyxHQUFHLE9BQU8sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsS0FBSyxJQUFJLEVBQUUsQ0FBQztRQUM3QyxNQUFNLElBQUksR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFFLENBQUE7UUFDdEIsMEVBQTBFO1FBQzFFLHVFQUF1RTtRQUN2RSxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLGNBQWMsRUFBRSxLQUFLLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFBO1FBQy9ELE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLEtBQUssRUFBRSxTQUFTLEtBQUssQ0FBQyxDQUFDLENBQUMs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