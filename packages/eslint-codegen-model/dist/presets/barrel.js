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
exports.barrel = void 0;
const generator_1 = __importDefault(require("@babel/generator"));
const parser_1 = require("@babel/parser");
const glob = __importStar(require("glob"));
const io_ts_extra_1 = require("io-ts-extra");
const lodash = __importStar(require("lodash"));
const path = __importStar(require("path"));
/**
 * Bundle several modules into a single convenient one.
 *
 * @example
 * // codegen:start {preset: barrel, include: some/path/*.ts, exclude: some/path/*util.ts}
 * export * from './some/path/module-a'
 * export * from './some/path/module-b'
 * export * from './some/path/module-c'
 * // codegen:end
 *
 * @param include
 * [optional] If specified, the barrel will only include file paths that match this glob pattern
 * @param exclude
 * [optional] If specified, the barrel will exclude file paths that match these glob patterns
 * @param import
 * [optional] If specified, matching files will be imported and re-exported rather than directly exported
 * with `export * from './xyz'`. Use `import: star` for `import * as xyz from './xyz'` style imports.
 * Use `import: default` for `import xyz from './xyz'` style imports.
 * @param export
 * [optional] Only valid if the import style has been specified (either `import: star` or `import: default`).
 * If specified, matching modules will be bundled into a const or default export based on this name. If set
 * to `{name: someName, keys: path}` the relative file paths will be used as keys. Otherwise the file paths
 * will be camel-cased to make them valid js identifiers.
 */
const barrel = ({ meta, options: opts }) => {
    var _a, _b;
    const cwd = path.dirname(meta.filename);
    const nodir = (_a = opts.nodir) !== null && _a !== void 0 ? _a : true;
    const modulegen = (_b = opts.modulegen) !== null && _b !== void 0 ? _b : false;
    const ext = meta.filename.split(".").slice(-1)[0];
    const pattern = opts.include || `*.${ext}`;
    const relativeFiles = glob
        .sync(pattern, { cwd, ignore: opts.exclude, nodir })
        .filter((f) => path.resolve(cwd, f) !== path.resolve(meta.filename))
        .map((f) => `./${f}`.replace(/(\.\/)+\./g, "."))
        .filter((file) => nodir
        ? [".js", ".mjs", ".ts", ".tsx"].includes(path.extname(file))
        : true)
        .map((f) => f.replace(/\.\w+$/, "").replace(/\/$/, ""));
    function last(list) {
        return list[list.length - 1];
    }
    const expectedContent = (0, io_ts_extra_1.match)(opts.import)
        .case(undefined, () => (0, io_ts_extra_1.match)(opts.export)
        .case({ as: "PascalCase" }, (v) => lodash
        .chain(relativeFiles)
        .map((f) => `export * as ${lodash
        .startCase(lodash.camelCase(last(f.split("/"))))
        .replace(/ /g, "") // why?
        .replace(/\//, "")}${"postfix" in v ? v.postfix : ""} from "${f}.js"`)
        .value()
        .join("\n"))
        .default(() => {
        return relativeFiles.map((f) => `export * from "${f}.js"`).join("\n");
    })
        .get())
        .case(String, (s) => {
        const importPrefix = s === "default" ? "" : "* as ";
        const withIdentifiers = lodash
            .chain(relativeFiles)
            .map((f) => ({
            file: f,
            identifier: lodash
                .camelCase(modulegen ? last(f.split("/")) : f)
                .replace(/^([^a-z])/, "_$1")
                .replace(/([\^/])Index$/, "$1")
        }))
            .groupBy((info) => info.identifier)
            .values()
            .flatMap((group) => group.length === 1
            ? group
            : group.map((info, i) => ({
                ...info,
                identifier: `${info.identifier}_${i + 1}`
            })))
            .value();
        const imports = withIdentifiers
            .map((i) => `import ${importPrefix}${i.identifier} from "${i.file}.js"`)
            .join("\n");
        const exportProps = modulegen ? [] : (0, io_ts_extra_1.match)(opts.export)
            .case({ name: String, keys: "path" }, () => withIdentifiers.map((i) => `${JSON.stringify(i.file)}: ${i.identifier}`))
            .default(() => withIdentifiers.map((i) => i.identifier))
            .get();
        const exportPrefix = (0, io_ts_extra_1.match)(opts.export)
            .case(undefined, () => "export")
            .case("default", () => "export default")
            .case({ name: "default" }, () => "export default")
            .case(String, (name) => `export const ${name} =`)
            .case({ name: String }, ({ name }) => `export const ${name} =`)
            .default(() => "")
            .get();
        const exports = exportProps.join(",\n ");
        const moduleGen = withIdentifiers
            .map((i) => {
            const up = `${i.identifier[0].toUpperCase()}${i.identifier.slice(1)}`;
            return `export interface ${up} extends Id<typeof ${i.identifier}> {}
export const ${up}: ${up} = ${i.identifier}`;
        })
            .join("\n");
        const exportss = modulegen ? "" : `\n${exportPrefix} {\n ${exports}\n}`;
        return `${imports}\n${exportss}\n${modulegen && moduleGen
            ? "type Id<T> = T\n/* eslint-disable @typescript-eslint/no-empty-object-type */\n\n" + moduleGen
            : ""}`;
    })
        .get();
    // ignore stylistic differences. babel generate deals with most
    const normalise = (str) => (0, generator_1.default)((0, parser_1.parse)(str, { sourceType: "module", plugins: ["typescript"] }))
        .code
        .replace(/'/g, `"`)
        .replace(/\/index/g, "");
    try {
        if (normalise(expectedContent) === normalise(meta.existingContent)) {
            return meta.existingContent;
        }
    }
    catch (_c) { }
    return expectedContent;
};
exports.barrel = barrel;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFycmVsLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL3ByZXNldHMvYmFycmVsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLGlFQUF1QztBQUN2QywwQ0FBcUM7QUFFckMsTUFBWSxJQUFJLGlDQUFZO0FBQzVCLDZDQUFtQztBQUNuQyxNQUFZLE1BQU0sbUNBQWM7QUFDaEMsTUFBWSxJQUFJLGlDQUFZO0FBRTVCOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztHQXVCRztBQUNJLE1BQU0sTUFBTSxHQVVkLENBQUMsRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxFQUFFLEVBQUU7O0lBQy9CLE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFBO0lBQ3ZDLE1BQU0sS0FBSyxTQUFHLElBQUksQ0FBQyxLQUFLLG1DQUFJLElBQUksQ0FBQTtJQUNoQyxNQUFNLFNBQVMsU0FBRyxJQUFJLENBQUMsU0FBUyxtQ0FBSSxLQUFLLENBQUE7SUFFekMsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUE7SUFDakQsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLE9BQU8sSUFBSSxLQUFLLEdBQUcsRUFBRSxDQUFBO0lBRTFDLE1BQU0sYUFBYSxHQUFHLElBQUk7U0FDdkIsSUFBSSxDQUFDLE9BQU8sRUFBRSxFQUFFLEdBQUcsRUFBRSxNQUFNLEVBQUUsSUFBSSxDQUFDLE9BQU8sRUFBRSxLQUFLLEVBQUUsQ0FBQztTQUNuRCxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQyxLQUFL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