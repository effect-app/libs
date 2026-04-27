import yaml from "js-yaml";
import { barrel } from "../../presets/barrel.js";
import { meta as metaPreset } from "../../presets/meta.js";
import { model } from "../../presets/model.js";
const blockRe = /^([ \t]*)\/\/ codegen:start[ \t]*(\{.*\})[ \t]*$\n?([\s\S]*?)^([ \t]*)\/\/ codegen:end[ \t]*$/gm;
function isRecord(input) {
    return typeof input === "object" && input !== null && !Array.isArray(input);
}
function isBlockOptions(input) {
    return isRecord(input) && typeof input["preset"] === "string";
}
function parseBlockOptions(input) {
    const parsed = yaml.load(input);
    if (!isBlockOptions(parsed)) {
        throw new Error(`Invalid codegen options: ${input}`);
    }
    return parsed;
}
function trimTrailingNewline(input) {
    return input.endsWith("\n") ? input.slice(0, -1) : input;
}
function isTypeScriptSource(filePath) {
    return /\.[cm]?tsx?$/.test(filePath);
}
function shouldStripJsExtensions(options, filePath) {
    return options.preset === "barrel"
        && options["jsExtensions"] === false
        && isTypeScriptSource(filePath);
}
function normaliseGeneratedContent(options, filePath, content) {
    if (!shouldStripJsExtensions(options, filePath)) {
        return content;
    }
    return content.replace(/(["'])(\.{1,2}\/[^"']+)\.js\1/g, "$1$2$1");
}
function indentBlock(content, indent) {
    if (indent.length === 0) {
        return content;
    }
    return content
        .split("\n")
        .map((line) => line.length === 0 ? line : `${indent}${line}`)
        .join("\n");
}
function renderPreset(options, meta) {
    const { preset, ...rest } = options;
    switch (preset) {
        case "barrel":
            return barrel({ meta, options: rest }, undefined);
        case "meta":
            return metaPreset({ meta, options: rest }, undefined);
        case "model":
            return model({ meta, options: rest }, undefined);
        default:
            throw new Error(`Unknown codegen preset: ${preset}`);
    }
}
const codegenRule = {
    meta: {
        type: "suggestion",
        fixable: "code",
        docs: {
            description: "Ensure codegen blocks are up to date"
        }
    },
    create(context) {
        return {
            Program(program) {
                const source = context.sourceCode.getText();
                const filename = context.physicalFilename;
                let match;
                blockRe.lastIndex = 0;
                while ((match = blockRe.exec(source)) !== null) {
                    const [fullMatch, indent = "", rawOptions = "", body = "", endIndent = ""] = match;
                    const matchStart = match.index;
                    const matchEnd = match.index + fullMatch.length;
                    let options;
                    try {
                        options = parseBlockOptions(rawOptions);
                    }
                    catch (_a) {
                        continue;
                    }
                    const existingContent = trimTrailingNewline(body);
                    let generatedContent;
                    try {
                        generatedContent = trimTrailingNewline(normaliseGeneratedContent(options, filename, renderPreset(options, { filename, existingContent })));
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29kZWdlbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9veGxpbnQvcnVsZXMvY29kZWdlbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLElBQUksTUFBTSxTQUFTLENBQUE7QUFHMUIsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLHlCQUF5QixDQUFBO0FBQ2hELE9BQU8sRUFBRSxJQUFJLElBQUksVUFBVSxFQUFFLE1BQU0sdUJBQXVCLENBQUE7QUFDMUQsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHdCQUF3QixDQUFBO0FBNEI5QyxNQUFNLE9BQU8sR0FBRyxpR0FBaUcsQ0FBQTtBQUVqSCxTQUFTLFFBQVEsQ0FBQyxLQUFjO0lBQzlCLE9BQU8sT0FBTyxLQUFLLEtBQUssUUFBUSxJQUFJLEtBQUssS0FBSyxJQUFJLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFBO0FBQzdFLENBQUM7QUFFRCxTQUFTLGNBQWMsQ0FBQyxLQUFjO0lBQ3BDLE9BQU8sUUFBUSxDQUFDLEtBQUssQ0FBQyxJQUFJLE9BQU8sS0FBSyxDQUFDLFFBQVEsQ0FBQyxLQUFLLFFBQVEsQ0FBQTtBQUMvRCxDQUFDO0FBRUQsU0FBUyxpQkFBaUIsQ0FBQyxLQUFhO0lBQ3RDLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUE7SUFDL0IsSUFBSSxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO1FBQzVCLE1BQU0sSUFBSSxLQUFLLENBQUMsNEJBQTRCLEtBQUssRUFBRSxDQUFDLENBQUE7SUFDdEQsQ0FBQztJQUNELE9BQU8sTUFBTSxDQUFBO0FBQ2YsQ0FBQztBQUVELFNBQVMsbUJBQW1CLENBQUMsS0FBYTtJQUN4QyxPQUFPLEtBQUssQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FB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