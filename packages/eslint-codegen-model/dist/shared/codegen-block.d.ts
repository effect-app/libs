import type { ModelTypeResolver } from "./type-resolver.js";
export type CodegenMeta = {
    filename: string;
    existingContent: string;
};
export type BlockOptions = Record<string, unknown> & {
    preset: string;
};
export declare const blockRe: RegExp;
export declare function isRecord(input: unknown): input is Record<string, unknown>;
export declare function isBlockOptions(input: unknown): input is BlockOptions;
export declare function parseBlockOptions(input: string): BlockOptions;
export declare function trimTrailingNewline(input: string): string;
export declare function isTypeScriptSource(filePath: string): boolean;
export declare function shouldStripJsExtensions(options: BlockOptions, filePath: string): boolean;
export declare function normaliseGeneratedContent(options: BlockOptions, filePath: string, content: string): string;
export declare function indentBlock(content: string, indent: string): string;
export type CodegenDefaults = Partial<Record<string, Record<string, unknown>>>;
export declare function applyDefaults(options: BlockOptions, defaults?: CodegenDefaults): BlockOptions;
export declare function renderPreset(options: BlockOptions, meta: CodegenMeta, fullSource?: string, resolver?: ModelTypeResolver): string;
//# sourceMappingURL=codegen-block.d.ts.map