import type { ModelTypeResolver } from "../shared/type-resolver.js";
export declare function getExportedModelNames(code: string): Array<string>;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9kZWwuZC50cyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9wcmVzZXRzL21vZGVsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUNBLE9BQU8sS0FBSyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sNEJBQTRCLENBQUE7QUFZbkUsd0JBQWdCLHFCQUFxQixDQUFDLElBQUksRUFBRSxNQUFNLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQXNCakU7QUFNRCxNQUFNLE1BQU0sWUFBWSxHQUFHO0lBQ3pCOzs7OztPQUtHO0lBQ0gsTUFBTSxDQUFDLEVBQUUsT0FBTyxDQUFBO0lBQ2hCOzs7T0FHRztJQUNILElBQUksQ0FBQyxFQUFFLE9BQU8sQ0FBQTtJQUNkOzs7T0FHRztJQUNILElBQUksQ0FBQyxFQUFFLE9BQU8sQ0FBQTtJQUNkLHlCQUF5QjtJQUN6QixjQUFjLENBQUMsRUFBRSxPQUFPLENBQUE7Q0FDekIsQ0FBQTtBQUVELHdCQUFnQixLQUFLLENBQ25CLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxFQUFFO0lBQUUsSUFBSSxFQUFFO1FBQUUsUUFBUSxFQUFFLE1BQU0sQ0FBQztRQUFDLGVBQWUsRUFBRSxNQUFNLENBQUE7S0FBRSxDQUFDO0lBQUMsT0FBTyxFQUFFLFlBQVksQ0FBQTtDQUFFLEVBQ2pHLE9BQU8sQ0FBQyxFQUFFLE9BQU8sRUFDakIsUUFBUSxDQUFDLEVBQUUsaUJBQWlCLEdBQzNCLE1BQU0sQ0FpRFIifQ==