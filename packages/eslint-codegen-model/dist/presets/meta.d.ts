type PresetFn<T = Record<string, unknown>> = (args: {
    meta: {
        filename: string;
        existingContent: string;
    };
    options: T;
}, context?: unknown) => string;
type MetaPresetOptions = {
    sourcePrefix?: string;
    stripSuffixes?: ReadonlyArray<string>;
};
/**
 * Adds file meta
 */
export declare const meta: PresetFn<MetaPresetOptions>;
export {};
//# sourceMappingURL=meta.d.ts.map