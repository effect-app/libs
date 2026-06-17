import { globSync } from "glob";
import * as path from "path";
import { normaliseModuleForBarrel } from "../normalise.js";
// dprint's default import/export sort: case-insensitive, then case-sensitive as
// a tie-break (uppercase before lowercase). Plain lexicographic, not numeric.
function bySpecifier(a, b) {
    const la = a.toLowerCase();
    const lb = b.toLowerCase();
    if (la !== lb)
        return la < lb ? -1 : 1;
    return a < b ? -1 : a > b ? 1 : 0;
}
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
    })
        // Match dprint's module-specifier sort so the generated barrel and the
        // formatter agree (otherwise lint-fix reorders the exports and codegen then
        // flags them as stale). dprint sorts case-insensitively, tie-breaking by the
        // original case (uppercase first); it is NOT numeric (`a10` before `a2`).
        .sort(bySpecifier);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFycmVsLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL3ByZXNldHMvYmFycmVsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxNQUFNLENBQUE7QUFDL0IsT0FBTyxLQUFLLElBQUksTUFBTSxNQUFNLENBQUE7QUFDNUIsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0saUJBQWlCLENBQUE7QUFFMUQsZ0ZBQWdGO0FBQ2hGLDhFQUE4RTtBQUM5RSxTQUFTLFdBQVcsQ0FBQyxDQUFTLEVBQUUsQ0FBUztJQUN2QyxNQUFNLEVBQUUsR0FBRyxDQUFDLENBQUMsV0FBVyxFQUFFLENBQUE7SUFDMUIsTUFBTSxFQUFFLEdBQUcsQ0FBQyxDQUFDLFdBQVcsRUFBRSxDQUFBO0lBQzFCLElBQUksRUFBRSxLQUFLLEVBQUU7UUFBRSxPQUFPLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUE7SUFDdEMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUE7QUFDbkMsQ0FBQztBQU9ELFNBQVMsSUFBSSxDQUFJLElBQWtCO0lBQ2pDLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUE7QUFDOUIsQ0FBQztBQUVELFNBQVMsVUFBVSxDQUFDLENBQVM7SUFDM0IsT0FBTyxDQUFDO1NBQ0wsT0FBTyxDQUFDLG1CQUFtQixFQUFFLE9BQU8sQ0FBQztTQUNyQyxPQUFPLENBQUMsdUJBQXVCLEVBQUUsT0FBTyxDQUFDO1NBQ3pDLEtBQUssQ0FBQyxlQUFlLENBQUM7U0FDdEIsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFBO0FBQ2hDLENBQUM7QUFFRCxTQUFTLFdBQVcsQ0FBQyxDQUFTO0lBQzVCLE9BQU8sVUFBVSxDQUFDLENBQUMsQ0FBQztTQUNqQixHQUFHLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxFQUFFLEVBQUU7UUFDZixNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUE7UUFDaEMsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUUsQ0FBQyxXQUFXLEVBQUUsR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFBO0lBQ25FLENBQUMsQ0FBQztTQUNELElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQTtBQUNiLENBQUM7QUFFRCxTQUFTLFlBQVksQ0FBQyxDQUFTO0lBQzdCLE9BQU8sVUFBVSxDQUFDLENBQUMsQ0FBQztTQUNqQixHQUFHLENBQUMsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUUsQ0FBQyxXQUFXLEVBQUUsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLFdBQVcsRUFBRSxDQUFDO1NBQ25FLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQTtBQUNiLENBQUM7QUFFRDs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBMkJHO0FBQ0gsTUFBTSxDQUFDLE1BQU0sTUFBTSxHQVdkLENBQUMsRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxFQUFFLEVBQUU7O0lBQy9CLE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFBO0lBQ3ZDLE1BQU0sS0FBSyxTQUFHLElBQUksQ0FBQyxLQUFLLG1DQUFJLElBQUksQ0FBQTtJQUNoQyxNQUFNLFNBQVMsU0FBRyxJQUFJLENBQUMsU0FBUyxtQ0FBSSxLQUFLLENBQUE7SUFDekMsTUFBTSxTQUFTLFNBQUcsSUFBSSxDQUFDLGVBQWUsbUNBQUksS0FBSyxDQUFBO0lBRS9DLE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFBO0lBQ2pELE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxPQUFPLElBQUksS0FBSyxHQUFHLEVBQUUsQ0FBQTtJQUUxQyxNQUFNLGFBQWEsR0FBRyxRQUFRLENBQUMsT0FBTyxFQUFFLEVBQUUsR0FBRyxFQUFFLEtBQUssRUFBRSxHQUFHLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsRUFBRSxNQUFNLEVBQUUsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDO1NBQ3ZHLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLEtBQUssSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7U0FDbkUsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxZQUFZLEVBQUUsR0FBRyxDQUFDLENBQUM7U0FDL0MsTUFBTSxDQUFDLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FDZixLQUFLO1FBQ0gsQ0FBQyxDQUFDLENBQUMsS0FBSyxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsTUFBTSxDQUFDLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDN0QsQ0FBQyxDQUFDLElBQUksQ0FDVDtTQUNBLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFO1FBQ1QsTUFBTSxLQUFLLEdBQUcsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQTtRQUM3QixNQUFNLE9BQU8sR0FBRyxDQUFDLENBQUMsT0FBTyxDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFBO1FBQzFELE9BQU8sS0FBSyxDQUFDLENBQUMsQ0FBQyxHQUFHLE9BQU8sUUFBUSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUE7SUFDN0MsQ0FBQyxDQUFDO1FBQ0YsdUVBQXVFO1FBQ3ZFLDRFQUE0RTtRQUM1RSw2RUFBNkU7UUFDN0UsMEVBQTBFO1NBQ3pFLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQTtJQUVwQixJQUFJLGVBQXVCLENBQUE7SUFFM0IsSUFBSSxJQUFJLENBQUMsTUFBTSxLQUFLLFNBQVMsRUFBRSxDQUFDO1FBQzlCLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUE7UUFDN0IsSUFDRSxPQUFPLFNBQVMsS0FBSyxRQUFRO2VBQzFCLFNBQVMsS0FBSyxJQUFJO2VBQ2xCLElBQUksSUFBSSxTQUFTO2VBQ2pCLFNBQVMsQ0FBQyxFQUFFLEtBQUssWUFBWSxFQUNoQyxDQUFDO1lBQ0QsZUFBZSxHQUFHLGFBQWE7aUJBQzVCLEdBQUcsQ0FDRixDQUFDLENBQUMsRUFBRSxFQUFFLENBQ0osZUFBZSxZQUFZLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUUsQ0FBQyxHQUM5QyxTQUFTLElBQUksU0FBUyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxFQUMvQyxVQUFVLENBQUMsR0FBRyxTQUFTLEdBQUcsQ0FDN0I7aUJBQ0EsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFBO1FBQ2YsQ0FBQzthQUFNLENBQUM7WUFDTixlQUFlLEdBQUcsYUFBYSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsa0JBQWtCLENBQUMsR0FBRyxTQUFTLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQTtRQUMzRixDQUFDO0lBQ0gsQ0FBQztTQUFNLENBQUM7UUFDTixNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsTUFBTSxLQUFLLFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUE7UUFDN0QsTUFBTSxjQUFjLEdBQUcsYUFBYSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztZQUMvQyxJQUFJLEVBQUUsQ0FBQztZQUNQLFVBQVUsRUFBRSxXQUFXLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7aUJBQ3pELE9BQU8sQ0FBQyxXQUFXLEVBQUUsS0FBSyxDQUFDO2lCQUMzQixPQUFPLENBQUMsZUFBZSxFQUFFLElBQUksQ0FBQztTQUNsQyxDQUFDLENBQUMsQ0FBQTtRQUVILE1BQU0sT0FBTyxHQUFHLGNBQWMsQ0FBQyxNQUFNLENBQ25DLENBQUMsR0FBRyxFQUFFLElBQUksRUFBRSxFQUFFOzs7WUFDWixDQUFDO1lBQUEsT0FBQyxHQUFHLE1BQUMsSUFBSSxDQUFDLFVBQVUscUNBQW5CLEdBQUcsT0FBc0IsRUFBRSxFQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFBO1lBQ3pDLE9BQU8sR0FBRyxDQUFBO1FBQ1osQ0FBQyxFQUNELEVBQUUsQ0FDSCxDQUFBO1FBQ0QsTUFBTSxlQUFlLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUMvRCxLQUFLLENBQUMsTUFBTSxLQUFLLENBQUM7WUFDaEIsQ0FBQyxDQUFDLEtBQUs7WUFDUCxDQUFDLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsRUFBRSxHQUFHLElBQUksRUFBRSxVQUFVLEVBQUUsR0FBRyxJQUFJLENBQUMsVUFBVSxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FDckYsQ0FBQTtRQUVELE1BQU0sT0FBTyxHQUFHLGVBQWU7YUFDNUIsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxVQUFVLFlBQVksR0FBRyxDQUFDLENBQUMsVUFBVSxVQUFVLENBQUMsQ0FBQyxJQUFJLEdBQUcsU0FBUyxHQUFHLENBQUM7YUFDaEYsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFBO1FBRWIsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQTtRQUM3QixNQUFNLFdBQVcsR0FBRyxTQUFTO1lBQzNCLENBQUMsQ0FBQyxFQUFFO1lBQ0osQ0FBQyxDQUFDLE9BQU8sU0FBUyxLQUFLLFFBQVE7bUJBQ3hCLFNBQVMsS0FBSyxJQUFJO21CQUNsQixNQUFNLElBQUksU0FBUzttQkFDbEIsU0FBMEQsQ0FBQyxJQUFJLEtBQUssTUFBTTtnQkFDbEYsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLFVBQVUsRUFBRSxDQUFDO2dCQUMxRSxDQUFDLENBQUMsZUFBZSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFBO1FBRTVDLElBQUksWUFBb0IsQ0FBQTtRQUN4QixJQUFJLFNBQVMsS0FBSyxTQUFTLEVBQUUsQ0FBQztZQUM1QixZQUFZLEdBQUcsUUFBUSxDQUFBO1FBQ3pCLENBQUM7YUFBTSxJQUFJLFNBQVMsS0FBSyxTQUFTLEVBQUUsQ0FBQztZQUNuQyxZQUFZLEdBQUcsZ0JBQWdCLENBQUE7UUFDakMsQ0FBQzthQUFNLElBQUksT0FBTyxTQUFTLEtBQUssUUFBUSxJQUFJLE1BQU0sSUFBSSxTQUFTLElBQUksU0FBUyxDQUFDLElBQUksS0FBSyxTQUFTLEVBQUUsQ0FBQztZQUNoRyxZQUFZLEdBQUcsZ0JBQWdCLENBQUE7UUFDakMsQ0FBQzthQUFNLElBQUksT0FBTyxTQUFTLEtBQUssUUFBUSxFQUFFLENBQUM7WUFDekMsWUFBWSxHQUFHLGdCQUFnQixTQUFTLElBQUksQ0FBQTtRQUM5QyxDQUFDO2FBQU0sSUFBSSxPQUFPLFNBQVMsS0FBSyxRQUFRLElBQUksTUFBTSxJQUFJLFNBQVMsRUFBRSxDQUFDO1lBQ2hFLFlBQVksR0FBRyxnQkFBZ0IsU0FBUyxDQUFDLElBQUksSUFBSSxDQUFBO1FBQ25ELENBQUM7YUFBTSxDQUFDO1lBQ04sWUFBWSxHQUFHLEVBQUUsQ0FBQTtRQUNuQixDQUFDO1FBRUQsTUFBTSxPQUFPLEdBQUcsV0FBVyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQTtRQUV4QyxNQUFNLFNBQVMsR0FBRyxlQUFlO2FBQzlCLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFO1lBQ1QsTUFBTSxFQUFFLEdBQUcsR0FBRyxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBRSxDQUFDLFdBQVcsRUFBRSxHQUFHLENBQUMsQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUE7WUFDdEUsT0FBTyxvQkFBb0IsRUFBRSxzQkFBc0IsQ0FBQyxDQUFDLFVBQVU7ZUFDeEQsRUFBRSxLQUFLLEVBQUUsTUFBTSxDQUFDLENBQUMsVUFBVSxFQUFFLENBQUE7UUFDdEMsQ0FBQyxDQUFDO2FBQ0QsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFBO1FBRWIsTUFBTSxRQUFRLEdBQUcsU0FBUyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssWUFBWSxRQUFRLE9BQU8sS0FBSyxDQUFBO1FBQ3ZFLGVBQWUsR0FBRyxHQUFHLE9BQU8sS0FBSyxRQUFRLEtBQ3ZDLFNBQVMsSUFBSSxTQUFTO1lBQ3BCLENBQUMsQ0FBQyxrRkFBa0YsR0FBRyxTQUFTO1lBQ2hHLENBQUMsQ0FBQyxFQUNOLEVBQUUsQ0FBQTtJQUNKLENBQUM7SUFFRCwyREFBMkQ7SUFDM0QsSUFBSSxlQUFlLENBQUMsSUFBSSxFQUFFLEtBQUssSUFBSSxDQUFDLGVBQWUsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDO1FBQzNELE9BQU8sSUFBSSxDQUFDLGVBQWUsQ0FBQTtJQUM3QixDQUFDO0lBRUQsb0VBQW9FO0lBQ3BFLElBQUksQ0FBQztRQUNILElBQ0Usd0JBQXdCLENBQUMsZUFBZSxFQUFFLElBQUksQ0FBQyxRQUFRLENBQUM7Z0JBQ2xELHdCQUF3QixDQUFDLElBQUksQ0FBQyxlQUFlLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxFQUNuRSxDQUFDO1lBQ0QsT0FBTyxJQUFJLENBQUMsZUFBZSxDQUFBO1FBQzdCLENBQUM7SUFDSCxDQUFDO2VBQU8sQ0FBQyxDQUFBLENBQUM7SUFFVixPQUFPLGVBQWUsQ0FBQTtBQUN4QixDQUFDLENBQUEifQ==