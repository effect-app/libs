export type ModelFacadeOptions = {
    readonly className?: string;
    readonly name?: string;
    readonly schema?: string;
    /**
     * Base mode: emit a non-exported base `class __X extends OpaqueFacade<...>()(_X) {}`
     * instead of `export class X`. The user owns `export class X extends __X { ...statics... }`,
     * so static/instance members live on the public class while `_X` stays a light schema.
     */
    readonly base?: boolean;
};
export declare function modelFacade({ meta, options }: {
    meta?: {
        existingContent: string;
    };
    options: ModelFacadeOptions;
}): string;
//# sourceMappingURL=model-facade.d.ts.map