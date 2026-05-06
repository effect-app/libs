import glob from "glob";
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
 */
export const barrel = ({ meta, options: opts }) => {
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
                .map((f) => `export * as ${toPascalCase(last(f.split("/")))}${"postfix" in exportOpt ? exportOpt.postfix : ""} from "${f}.js"`)
                .join("\n");
        }
        else {
            expectedContent = relativeFiles.map((f) => `export * from "${f}.js"`).join("\n");
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
            .map((i) => `import ${importPrefix}${i.identifier} from "${i.file}.js"`)
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
    catch (_c) { }
    return expectedContent;
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFycmVsLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL3ByZXNldHMvYmFycmVsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLE9BQU8sSUFBSSxNQUFNLE1BQU0sQ0FBQTtBQUN2QixPQUFPLEtBQUssSUFBSSxNQUFNLE1BQU0sQ0FBQTtBQUM1QixPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQTtBQU8xRCxTQUFTLElBQUksQ0FBSSxJQUFrQjtJQUNqQyxPQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFBO0FBQzlCLENBQUM7QUFFRCxTQUFTLFVBQVUsQ0FBQyxDQUFTO0lBQzNCLE9BQU8sQ0FBQztTQUNMLE9BQU8sQ0FBQyxtQkFBbUIsRUFBRSxPQUFPLENBQUM7U0FDckMsT0FBTyxDQUFDLHVCQUF1QixFQUFFLE9BQU8sQ0FBQztTQUN6QyxLQUFLLENBQUMsZUFBZSxDQUFDO1NBQ3RCLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQTtBQUNoQyxDQUFDO0FBRUQsU0FBUyxXQUFXLENBQUMsQ0FBUztJQUM1QixPQUFPLFVBQVUsQ0FBQyxDQUFDLENBQUM7U0FDakIsR0FBRyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUMsRUFBRSxFQUFFO1FBQ2YsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFBO1FBQ2hDLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFFLENBQUMsV0FBVyxFQUFFLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQTtJQUNuRSxDQUFDLENBQUM7U0FDRCxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUE7QUFDYixDQUFDO0FBRUQsU0FBUyxZQUFZ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