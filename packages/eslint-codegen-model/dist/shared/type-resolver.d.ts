export interface ResolveOptions {
    /** Also emit a static `Type` interface (decoded side), enabling `S.OpaqueType<X.Type, X.Encoded>`. */
    readonly type?: boolean;
    /** Also emit a static `Make` interface (make-input side), enabling `S.OpaqueShape<X.Type, X.Encoded, X.Make>`. Implies `type`. */
    readonly make?: boolean;
    /** Emit a shallow public `Schema` facade and top-level instance interface. Implies `type` and `make`. */
    readonly facade?: boolean;
}
export interface ModelTypeResolver {
    /**
     * Generate the `export namespace X { export interface Encoded {...} }` blocks for the
     * given models in `filename`. Returns the joined block body, or `null` when the file
     * is not part of the program / a model can't be resolved.
     */
    generate(filename: string, modelNames: ReadonlyArray<string>, options: ResolveOptions): string | null;
}
export declare function createModelTypeResolver(args: {
    readonly tsconfigPath: string;
    /** Extra files to include as program roots (the files being codegen'd). */
    readonly files?: ReadonlyArray<string>;
}): ModelTypeResolver;
//# sourceMappingURL=type-resolver.d.ts.map