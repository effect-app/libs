import type { ModelTypeResolver } from "../shared/type-resolver.js";
export declare function getExportedModelNames(code: string): Array<string>;
export declare function getFacadeableModelNames(code: string): Array<string>;
export type ModelOptions = {
    /**
     * Emit expanded literal `Encoded` interfaces (nested models referenced by name) instead of
     * `interface Encoded extends StructNestedEncoded<typeof X>`. Greatly reduces instantiation
     * on Encoded-touching consumers. Requires a type resolver (CLI only); without one (e.g. the
     * oxlint rule) static blocks are left untouched.
     */
    static?: boolean;
    /**
     * With `static`, also emit a literal `Type` interface (decoded side); the class is
     * rewritten to `S.OpaqueType<X.Type, X.Encoded>` so the instance uses it.
     */
    type?: boolean;
    /**
     * With `static`, also emit a literal `Make` interface (make-input side); the class is
     * rewritten to `S.OpaqueShape<X.Type, X.Encoded, X.Make>`. Implies `type`.
     */
    make?: boolean;
    /**
     * With `static`, emit a shallow exported facade for private model classes. Implies
     * `type` and `make`; the CLI rewrites `export class X` into private `class _X`
     * plus `export class X extends S.OpaqueFacadeClass<X, X.Encoded, X.Make, X.DecodingServices, X.EncodingServices>()(_X) {}`.
     */
    facade?: boolean;
    /** @deprecated unused */
    writeFullTypes?: boolean;
};
export declare function model({ meta, options }: {
    meta: {
        filename: string;
        existingContent: string;
    };
    options: ModelOptions;
}, context?: unknown, resolver?: ModelTypeResolver): string;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9kZWwuZC50cyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9wcmVzZXRzL21vZGVsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUNBLE9BQU8sS0FBSyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sNEJBQTRCLENBQUE7QUFhbkUsd0JBQWdCLHFCQUFxQixDQUFDLElBQUksRUFBRSxNQUFNLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQWdDakU7QUFzQkQsd0JBQWdCLHVCQUF1QixDQUFDLElBQUksRUFBRSxNQUFNLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQU9uRTtBQU1ELE1BQU0sTUFBTSxZQUFZLEdBQUc7SUFDekI7Ozs7O09BS0c7SUFDSCxNQUFNLENBQUMsRUFBRSxPQUFPLENBQUE7SUFDaEI7OztPQUdHO0lBQ0gsSUFBSSxDQUFDLEVBQUUsT0FBTyxDQUFBO0lBQ2Q7OztPQUdHO0lBQ0gsSUFBSSxDQUFDLEVBQUUsT0FBTyxDQUFBO0lBQ2Q7Ozs7T0FJRztJQUNILE1BQU0sQ0FBQyxFQUFFLE9BQU8sQ0FBQTtJQUNoQix5QkFBeUI7SUFDekIsY0FBYyxDQUFDLEVBQUUsT0FBTyxDQUFBO0NBQ3pCLENBQUE7QUFFRCx3QkFBZ0IsS0FBSyxDQUNuQixFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsRUFBRTtJQUFFLElBQUksRUFBRTtRQUFFLFFBQVEsRUFBRSxNQUFNLENBQUM7UUFBQyxlQUFlLEVBQUUsTUFBTSxDQUFBO0tBQUUsQ0FBQztJQUFDLE9BQU8sRUFBRSxZQUFZLENBQUE7Q0FBRSxFQUNqRyxPQUFPLENBQUMsRUFBRSxPQUFPLEVBQ2pCLFFBQVEsQ0FBQyxFQUFFLGlCQUFpQixHQUMzQixNQUFNLENBZ0VSIn0=