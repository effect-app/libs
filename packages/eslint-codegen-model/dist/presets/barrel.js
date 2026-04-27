import glob from "glob";
import { match } from "io-ts-extra";
import lodash from "lodash";
import * as path from "path";
import { normaliseModuleForBarrel } from "../normalise.js";
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
    function last(list) {
        return list[list.length - 1];
    }
    const expectedContent = match(opts.import)
        .case(undefined, () => match(opts.export)
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
        const exportProps = modulegen ? [] : match(opts.export)
            .case({ name: String, keys: "path" }, () => withIdentifiers.map((i) => `${JSON.stringify(i.file)}: ${i.identifier}`))
            .default(() => withIdentifiers.map((i) => i.identifier))
            .get();
        const exportPrefix = match(opts.export)
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
    try {
        if (normaliseModuleForBarrel(expectedContent, meta.filename)
            === normaliseModuleForBarrel(meta.existingContent, meta.filename)) {
            return meta.existingContent;
        }
    }
    catch (_c) { }
    return expectedContent;
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFycmVsLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL3ByZXNldHMvYmFycmVsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUNBLE9BQU8sSUFBSSxNQUFNLE1BQU0sQ0FBQTtBQUN2QixPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sYUFBYSxDQUFBO0FBQ25DLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQTtBQUMzQixPQUFPLEtBQUssSUFBSSxNQUFNLE1BQU0sQ0FBQTtBQUM1QixPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQTtBQUUxRDs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7R0F1Qkc7QUFDSCxNQUFNLENBQUMsTUFBTSxNQUFNLEdBVWQsQ0FBQyxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLEVBQUUsRUFBRTs7SUFDL0IsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUE7SUFDdkMsTUFBTSxLQUFLLFNBQUcsSUFBSSxDQUFDLEtBQUssbUNBQUksSUFBSSxDQUFBO0lBQ2hDLE1BQU0sU0FBUyxTQUFHLElBQUksQ0FBQyxTQUFTLG1DQUFJLEtBQUssQ0FBQTtJQUV6QyxNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQTtJQUNqRCxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsT0FBTyxJQUFJLEtBQUssR0FBRyxFQUFFLENBQUE7SUFFMUMsTUFBTSxhQUFhLEdBQUcsSUFBSTtTQUN2QixJQUFJLENBQUMsT0FBTyxFQUFFLEVBQUUsR0FBRyxFQUFFLE1BQU0sRUFBRSxJQUFJLENBQUMsT0FBTyxFQUFFLEtBQUssRUFBRSxDQUFDO1NBQ25ELE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFF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