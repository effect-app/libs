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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHlwZS1yZXNvbHZlci5kLnRzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL3NoYXJlZC90eXBlLXJlc29sdmVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQTBCQSxNQUFNLFdBQVcsY0FBYztJQUM3QixzR0FBc0c7SUFDdEcsUUFBUSxDQUFDLElBQUksQ0FBQyxFQUFFLE9BQU8sQ0FBQTtJQUN2QixrSUFBa0k7SUFDbEksUUFBUSxDQUFDLElBQUksQ0FBQyxFQUFFLE9BQU8sQ0FBQTtJQUN2Qix5R0FBeUc7SUFDekcsUUFBUSxDQUFDLE1BQU0sQ0FBQyxFQUFFLE9BQU8sQ0FBQTtDQUMxQjtBQUVELE1BQU0sV0FBVyxpQkFBaUI7SUFDaEM7Ozs7T0FJRztJQUNILFFBQVEsQ0FBQyxRQUFRLEVBQUUsTUFBTSxFQUFFLFVBQVUsRUFBRSxhQUFhLENBQUMsTUFBTSxDQUFDLEVBQUUsT0FBTyxFQUFFLGNBQWMsR0FBRyxNQUFNLEdBQUcsSUFBSSxDQUFBO0NBQ3RHO0FBdUJELHdCQUFnQix1QkFBdUIsQ0FBQyxJQUFJLEVBQUU7SUFDNUMsUUFBUSxDQUFDLFlBQVksRUFBRSxNQUFNLENBQUE7SUFDN0IsMkVBQTJFO0lBQzNFLFFBQVEsQ0FBQyxLQUFLLENBQUMsRUFBRSxhQUFhLENBQUMsTUFBTSxDQUFDLENBQUE7Q0FDdkMsR0FBRyxpQkFBaUIsQ0FrR3BCIn0=