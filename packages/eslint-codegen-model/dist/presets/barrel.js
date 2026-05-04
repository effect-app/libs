import glob from "glob";
import * as path from "path";
import { normaliseModuleForBarrel } from "../normalise.js";
function last(list) {
    return list[list.length - 1];
}
function toCamelCase(s) {
    var _a;
    const words = (_a = s.match(/[a-zA-Z0-9]+/g)) !== null && _a !== void 0 ? _a : [];
    return words
        .map((word, i) => {
        const lower = word.toLowerCase();
        return i === 0 ? lower : lower[0].toUpperCase() + lower.slice(1);
    })
        .join("");
}
function toPascalCase(s) {
    var _a;
    const words = (_a = s.match(/[a-zA-Z0-9]+/g)) !== null && _a !== void 0 ? _a : [];
    return words
        .map((word) => {
        const lower = word.toLowerCase();
        return lower[0].toUpperCase() + lower.slice(1);
    })
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFycmVsLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL3ByZXNldHMvYmFycmVsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLE9BQU8sSUFBSSxNQUFNLE1BQU0sQ0FBQTtBQUN2QixPQUFPLEtBQUssSUFBSSxNQUFNLE1BQU0sQ0FBQTtBQUM1QixPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQTtBQU8xRCxTQUFTLElBQUksQ0FBSSxJQUFrQjtJQUNqQyxPQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFBO0FBQzlCLENBQUM7QUFFRCxTQUFTLFdBQVcsQ0FBQyxDQUFTOztJQUM1QixNQUFNLEtBQUssU0FBRyxDQUFDLENBQUMsS0FBSyxDQUFDLGVBQWUsQ0FBQyxtQ0FBSSxFQUFFLENBQUE7SUFDNUMsT0FBTyxLQUFLO1NBQ1QsR0FBRyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUMsRUFBRSxFQUFFO1FBQ2YsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFBO1FBQ2hDLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFFLENBQUMsV0FBVyxFQUFFLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQTtJQUNuRSxDQUFDLENBQUM7U0FDRCxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUE7QUFDYixDQUFDO0FBRUQsU0FBUyxZQUFZLENBQUMsQ0FBUzs7SUFDN0IsTUFBTSxLQUFLLFNBQUcsQ0FBQyxDQUFDLEtBQUssQ0FBQyxlQUFlLENBQUMsbUNBQUksRUFBRSxDQUFBO0lBQzVDLE9BQU8sS0FBSztTQUNULEdBQUcsQ0FBQyxDQUFDLElBQUksRUFBRSxFQUFFO1FBQ1osTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFBO1FB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