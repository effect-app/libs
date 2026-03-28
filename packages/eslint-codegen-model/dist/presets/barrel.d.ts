import type { Preset } from "eslint-plugin-codegen";
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
export declare const barrel: Preset<{
    include?: string;
    exclude?: string | string[];
    import?: "default" | "star";
    export?: string | {
        name: string;
        keys: "path" | "camelCase";
    } | {
        as: "PascalCase";
        postfix?: string;
    };
    nodir?: boolean;
    modulegen?: boolean;
}>;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFycmVsLmQudHMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvcHJlc2V0cy9iYXJyZWwudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBRUEsT0FBTyxLQUFLLEVBQUUsTUFBTSxFQUFFLE1BQU0sdUJBQXVCLENBQUE7QUFNbkQ7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBdUJHO0FBQ0gsZUFBTyxNQUFNLE1BQU0sRUFBRSxNQUFNLENBQUM7SUFDMUIsT0FBTyxDQUFDLEVBQUUsTUFBTSxDQUFBO0lBQ2hCLE9BQU8sQ0FBQyxFQUFFLE1BQU0sR0FBRyxNQUFNLEVBQUUsQ0FBQTtJQUMzQixNQUFNLENBQUMsRUFBRSxTQUFTLEdBQUcsTUFBTSxDQUFBO0lBQzNCLE1BQU0sQ0FBQyxFQUNILE1BQU0sR0FDTjtRQUFFLElBQUksRUFBRSxNQUFNLENBQUM7UUFBQyxJQUFJLEVBQUUsTUFBTSxHQUFHLFdBQVcsQ0FBQTtLQUFFLEdBQzVDO1FBQUUsRUFBRSxFQUFFLFlBQVksQ0FBQztRQUFDLE9BQU8sQ0FBQyxFQUFFLE1BQU0sQ0FBQTtLQUFFLENBQUE7SUFDMUMsS0FBSyxDQUFDLEVBQUUsT0FBTyxDQUFBO0lBQ2YsU0FBUyxDQUFDLEVBQUUsT0FBTyxDQUFBO0NBQ3BCLENBMEhBLENBQUEifQ==