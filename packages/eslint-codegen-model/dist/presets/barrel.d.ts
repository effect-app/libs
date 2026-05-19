type PresetFn<T = Record<string, unknown>> = (args: {
    meta: {
        filename: string;
        existingContent: string;
    };
    options: T;
}, context?: unknown) => string;
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
export declare const barrel: PresetFn<{
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
    importExtension?: string;
}>;
export {};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFycmVsLmQudHMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvcHJlc2V0cy9iYXJyZWwudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBSUEsS0FBSyxRQUFRLENBQUMsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxNQUFNLEVBQUUsT0FBTyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUU7SUFDbEQsSUFBSSxFQUFFO1FBQUUsUUFBUSxFQUFFLE1BQU0sQ0FBQztRQUFDLGVBQWUsRUFBRSxNQUFNLENBQUE7S0FBRSxDQUFBO0lBQ25ELE9BQU8sRUFBRSxDQUFDLENBQUE7Q0FDWCxFQUFFLE9BQU8sQ0FBQyxFQUFFLE9BQU8sS0FBSyxNQUFNLENBQUE7QUE2Qi9COzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7R0EyQkc7QUFDSCxlQUFPLE1BQU0sTUFBTSxFQUFFLFFBQVEsQ0FBQztJQUM1QixPQUFPLENBQUMsRUFBRSxNQUFNLENBQUE7SUFDaEIsT0FBTyxDQUFDLEVBQUUsTUFBTSxHQUFHLE1BQU0sRUFBRSxDQUFBO0lBQzNCLE1BQU0sQ0FBQyxFQUFFLFNBQVMsR0FBRyxNQUFNLENBQUE7SUFDM0IsTUFBTSxDQUFDLEVBQ0gsTUFBTSxHQUNOO1FBQUUsSUFBSSxFQUFFLE1BQU0sQ0FBQztRQUFDLElBQUksRUFBRSxNQUFNLEdBQUcsV0FBVyxDQUFBO0tBQUUsR0FDNUM7UUFBRSxFQUFFLEVBQUUsWUFBWSxDQUFDO1FBQUMsT0FBTyxDQUFDLEVBQUUsTUFBTSxDQUFBO0tBQUUsQ0FBQTtJQUMxQyxLQUFLLENBQUMsRUFBRSxPQUFPLENBQUE7SUFDZixTQUFTLENBQUMsRUFBRSxPQUFPLENBQUE7SUFDbkIsZUFBZSxDQUFDLEVBQUUsTUFBTSxDQUFBO0NBQ3pCLENBa0lBLENBQUEifQ==