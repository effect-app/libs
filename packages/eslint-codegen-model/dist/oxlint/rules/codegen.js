import * as fs from "node:fs";
import * as path from "node:path";
import { applyDefaults, blockRe, indentBlock, normaliseGeneratedContent, parseBlockOptions, renderPreset, trimTrailingNewline } from "../../shared/codegen-block.js";
import { createNativeModelTypeResolver } from "../../shared/native-type-resolver.js";
/** Nearest `tsconfig.json` walking up from `from`, or null. */
function findNearestTsconfig(from) {
    let dir = path.dirname(from);
    for (;;) {
        const candidate = path.join(dir, "tsconfig.json");
        if (fs.existsSync(candidate))
            return candidate;
        const parent = path.dirname(dir);
        if (parent === dir)
            return null;
        dir = parent;
    }
}
/**
 * Editor/CI type-aware resolver, opt-in via `TSGOLINT_CODEGEN_BIN`. When set,
 * the oxlint codegen rule resolves `static`/`facade` model blocks through the
 * tsgo fork -- so facade interfaces stay live in the editor without running the
 * CLI. Without the env var the rule keeps its text-only behaviour (no checker,
 * static/facade blocks left untouched). Cached per tsconfig per process.
 */
const nativeResolvers = new Map();
function nativeResolverFor(filename) {
    var _a;
    // Native (tsgo) is the default: the binary ships as the `oxlint-tsgolint`
    // drop-in, and the resolver is lazy (no binary work until a static/facade
    // block actually calls it). Set `TSGOLINT_CODEGEN_OFF` to fall back to
    // text-only (static/facade blocks left untouched). `TSGOLINT_CODEGEN_BIN`
    // overrides the binary path.
    if (process.env["TSGOLINT_CODEGEN_OFF"])
        return undefined;
    const tsconfigPath = findNearestTsconfig(filename);
    if (!tsconfigPath)
        return undefined;
    if (!nativeResolvers.has(tsconfigPath)) {
        try {
            nativeResolvers.set(tsconfigPath, createNativeModelTypeResolver({ tsconfigPath }));
        }
        catch (_b) {
            nativeResolvers.set(tsconfigPath, null);
        }
    }
    return (_a = nativeResolvers.get(tsconfigPath)) !== null && _a !== void 0 ? _a : undefined;
}
const codegenRule = {
    meta: {
        type: "suggestion",
        fixable: "code",
        schema: [{
                type: "object",
                additionalProperties: {
                    type: "object",
                    additionalProperties: true
                }
            }],
        docs: {
            description: "Ensure codegen blocks are up to date"
        }
    },
    create(context) {
        var _a;
        const defaults = ((_a = context.options[0]) !== null && _a !== void 0 ? _a : undefined);
        return {
            Program(program) {
                const source = context.sourceCode.getText();
                const filename = context.physicalFilename;
                const resolver = nativeResolverFor(filename);
                // Create a fresh regex instance per Program visit to avoid shared lastIndex state
                const re = new RegExp(blockRe.source, blockRe.flags);
                let match;
                while ((match = re.exec(source)) !== null) {
                    const [fullMatch, indent = "", rawOptions = "", body = "", endIndent = ""] = match;
                    const matchStart = match.index;
                    const matchEnd = match.index + fullMatch.length;
                    let options;
                    try {
                        options = applyDefaults(parseBlockOptions(rawOptions), defaults);
                    }
                    catch (_a) {
                        continue;
                    }
                    const existingContent = trimTrailingNewline(body);
                    let generatedContent;
                    try {
                        generatedContent = trimTrailingNewline(normaliseGeneratedContent(options, filename, renderPreset(options, { filename, existingContent }, source, resolver)));
                    }
                    catch (_b) {
                        continue;
                    }
                    const nextBody = generatedContent.length > 0 ? `${indentBlock(generatedContent, indent)}\n` : "";
                    const replacement = `${indent}// codegen:start ${rawOptions}\n${nextBody}${endIndent}// codegen:end`;
                    if (replacement !== fullMatch) {
                        context.report({
                            node: program,
                            message: `codegen block with preset "${options.preset}" is stale`,
                            fix(fixer) {
                                return fixer.replaceTextRange([matchStart, matchEnd], replacement);
                            }
                        });
                    }
                }
            }
        };
    }
};
export default codegenRule;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29kZWdlbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9veGxpbnQvcnVsZXMvY29kZWdlbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFFQSxPQUFPLEtBQUssRUFBRSxNQUFNLFNBQVMsQ0FBQTtBQUM3QixPQUFPLEtBQUssSUFBSSxNQUFNLFdBQVcsQ0FBQTtBQUNqQyxPQUFPLEVBQUUsYUFBYSxFQUFxQixPQUFPLEVBQXdCLFdBQVcsRUFBRSx5QkFBeUIsRUFBRSxpQkFBaUIsRUFBRSxZQUFZLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQTtBQUM3TSxPQUFPLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQTtBQUdwRiwrREFBK0Q7QUFDL0QsU0FBUyxtQkFBbUIsQ0FBQyxJQUFZO0lBQ3ZDLElBQUksR0FBRyxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUE7SUFDNUIsU0FBUyxDQUFDO1FBQ1IsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsZUFBZSxDQUFDLENBQUE7UUFDakQsSUFBSSxFQUFFLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQztZQUFFLE9BQU8sU0FBUyxDQUFBO1FBQzlDLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUE7UUFDaEMsSUFBSSxNQUFNLEtBQUssR0FBRztZQUFFLE9BQU8sSUFBSSxDQUFBO1FBQy9CLEdBQUcsR0FBRyxNQUFNLENBQUE7SUFDZCxDQUFDO0FBQ0gsQ0FBQztBQUVEOzs7Ozs7R0FNRztBQUNILE1BQU0sZUFBZSxHQUFHLElBQUksR0FBRyxFQUFvQyxDQUFBO0FBQ25FLFNBQVMsaUJBQWlCLENBQUMsUUFBZ0I7O0lBQ3pDLDBFQUEwRTtJQUMxRSwwRUFBMEU7SUFDMUUsdUVBQXVFO0lBQ3ZFLDBFQUEwRTtJQUMxRSw2QkFBNkI7SUFDN0IsSUFBSSxP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