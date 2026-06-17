import { globSync } from "glob";
import * as path from "path";
import { normaliseModuleForBarrel } from "../normalise.js";
function last(list) {
    return list[list.length - 1];
}
function splitWords(s) {
    return s
        .replace(/([a-z\d])([A-Z])/g, "$1 $2")
        .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
        .split(/[^a-zA-Z0-9]+/)
        .filter((w) => w.length > 0);
}
function toCamelCase(s) {
    return splitWords(s)
        .map((word, i) => {
        const lower = word.toLowerCase();
        return i === 0 ? lower : lower[0].toUpperCase() + lower.slice(1);
    })
        .join("");
}
function toPascalCase(s) {
    return splitWords(s)
        .map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase())
        .join("");
}
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
 * @param importExtension
 * [optional] Extension used on the emitted import/export specifiers. Defaults to `.ts`. Set to `.js` (or
 * empty string) to emit unsuffixed/TS specifiers. Configurable per block, or globally via the rule option
 * `{ barrel: { importExtension: ".js" } }` / `codegen.config.json`.
 */
export const barrel = ({ meta, options: opts }) => {
    var _a, _b, _c;
    const cwd = path.dirname(meta.filename);
    const nodir = (_a = opts.nodir) !== null && _a !== void 0 ? _a : true;
    const modulegen = (_b = opts.modulegen) !== null && _b !== void 0 ? _b : false;
    const importExt = (_c = opts.importExtension) !== null && _c !== void 0 ? _c : ".ts";
    const ext = meta.filename.split(".").slice(-1)[0];
    const pattern = opts.include || `*.${ext}`;
    const relativeFiles = globSync(pattern, { cwd, nodir, ...(opts.exclude ? { ignore: opts.exclude } : {}) })
        .filter((f) => path.resolve(cwd, f) !== path.resolve(meta.filename))
        .map((f) => `./${f}`.replace(/(\.\/)+\./g, "."))
        .filter((file) => nodir
        ? [".js", ".mjs", ".ts", ".tsx"].includes(path.extname(file))
        : true)
        .map((f) => {
        const isDir = f.endsWith("/");
        const cleaned = f.replace(/\.\w+$/, "").replace(/\/$/, "");
        return isDir ? `${cleaned}/index` : cleaned;
    });
    let expectedContent;
    if (opts.import === undefined) {
        const exportOpt = opts.export;
        if (typeof exportOpt === "object"
            && exportOpt !== null
            && "as" in exportOpt
            && exportOpt.as === "PascalCase") {
            expectedContent = relativeFiles
                .map((f) => `export * as ${toPascalCase(last(f.split("/")))}${"postfix" in exportOpt ? exportOpt.postfix : ""} from "${f}${importExt}"`)
                .join("\n");
        }
        else {
            expectedContent = relativeFiles.map((f) => `export * from "${f}${importExt}"`).join("\n");
        }
    }
    else {
        const importPrefix = opts.import === "default" ? "" : "* as ";
        const rawIdentifiers = relativeFiles.map((f) => ({
            file: f,
            identifier: toCamelCase(modulegen ? last(f.split("/")) : f)
                .replace(/^([^a-z])/, "_$1")
                .replace(/([\^/])Index$/, "$1")
        }));
        const grouped = rawIdentifiers.reduce((acc, info) => {
            var _a;
            var _b;
            ;
            ((_a = acc[_b = info.identifier]) !== null && _a !== void 0 ? _a : (acc[_b] = [])).push(info);
            return acc;
        }, {});
        const withIdentifiers = Object.values(grouped).flatMap((group) => group.length === 1
            ? group
            : group.map((info, i) => ({ ...info, identifier: `${info.identifier}_${i + 1}` })));
        const imports = withIdentifiers
            .map((i) => `import ${importPrefix}${i.identifier} from "${i.file}${importExt}"`)
            .join("\n");
        const exportOpt = opts.export;
        const exportProps = modulegen
            ? []
            : typeof exportOpt === "object"
                && exportOpt !== null
                && "keys" in exportOpt
                && exportOpt.keys === "path"
                ? withIdentifiers.map((i) => `${JSON.stringify(i.file)}: ${i.identifier}`)
                : withIdentifiers.map((i) => i.identifier);
        let exportPrefix;
        if (exportOpt === undefined) {
            exportPrefix = "export";
        }
        else if (exportOpt === "default") {
            exportPrefix = "export default";
        }
        else if (typeof exportOpt === "object" && "name" in exportOpt && exportOpt.name === "default") {
            exportPrefix = "export default";
        }
        else if (typeof exportOpt === "string") {
            exportPrefix = `export const ${exportOpt} =`;
        }
        else if (typeof exportOpt === "object" && "name" in exportOpt) {
            exportPrefix = `export const ${exportOpt.name} =`;
        }
        else {
            exportPrefix = "";
        }
        const exports = exportProps.join(",\n ");
        const moduleGen = withIdentifiers
            .map((i) => {
            const up = `${i.identifier[0].toUpperCase()}${i.identifier.slice(1)}`;
            return `export interface ${up} extends Id<typeof ${i.identifier}> {}
export const ${up}: ${up} = ${i.identifier}`;
        })
            .join("\n");
        const exportss = modulegen ? "" : `\n${exportPrefix} {\n ${exports}\n}`;
        expectedContent = `${imports}\n${exportss}\n${modulegen && moduleGen
            ? "type Id<T> = T\n/* eslint-disable @typescript-eslint/no-empty-object-type */\n\n" + moduleGen
            : ""}`;
    }
    // Fast path: exact match after trimming (avoids AST parse)
    if (expectedContent.trim() === meta.existingContent.trim()) {
        return meta.existingContent;
    }
    // Slow path: AST-based comparison (handles /index equivalence etc.)
    try {
        if (normaliseModuleForBarrel(expectedContent, meta.filename)
            === normaliseModuleForBarrel(meta.existingContent, meta.filename)) {
            return meta.existingContent;
        }
    }
    catch (_d) { }
    return expectedContent;
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFycmVsLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL3ByZXNldHMvYmFycmVsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxNQUFNLENBQUE7QUFDL0IsT0FBTyxLQUFLLElBQUksTUFBTSxNQUFNLENBQUE7QUFDNUIsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0saUJBQWlCLENBQUE7QUFPMUQsU0FBUyxJQUFJLENBQUksSUFBa0I7SUFDakMsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQTtBQUM5QixDQUFDO0FBRUQsU0FBUyxVQUFVLENBQUMsQ0FBUztJQUMzQixPQUFPLENBQUM7U0FDTCxPQUFPLENBQUMsbUJBQW1CLEVBQUUsT0FBTyxDQUFDO1NBQ3JDLE9BQU8sQ0FBQyx1QkFBdUIsRUFBRSxPQUFPLENBQUM7U0FDekMsS0FBSyxDQUFDLGVBQWUsQ0FBQztTQUN0QixNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUE7QUFDaEMsQ0FBQztBQUVELFNBQVMsV0FBVyxDQUFDLENBQVM7SUFDNUIsT0FBTyxVQUFVLENBQUMsQ0FBQyxDQUFDO1NBQ2pCLEdBQUcsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDLEVBQUUsRUFBRTtRQUNmLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQTtRQUNoQyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBRSxDQUFDLFdBQVcsRUFBRSxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUE7SUFDbkUsQ0FBQyxDQUFDO1NBQ0QsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFBO0FBQ2IsQ0FBQztBQUVE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