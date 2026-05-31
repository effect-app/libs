import { applyDefaults, blockRe, indentBlock, normaliseGeneratedContent, parseBlockOptions, renderPreset, trimTrailingNewline } from "../../shared/codegen-block.js";
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
                        generatedContent = trimTrailingNewline(normaliseGeneratedContent(options, filename, renderPreset(options, { filename, existingContent }, source)));
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29kZWdlbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9veGxpbnQvcnVsZXMvY29kZWdlbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFFQSxPQUFPLEVBQUUsYUFBYSxFQUFxQixPQUFPLEVBQXdCLFdBQVcsRUFBRSx5QkFBeUIsRUFBRSxpQkFBaUIsRUFBRSxZQUFZLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQTtBQXlCN00sTUFBTSxXQUFXLEdBQWU7SUFDOUIsSUFBSSxFQUFFO1FBQ0osSUFBSSxFQUFFLFlBQVk7UUFDbEIsT0FBTyxFQUFFLE1BQU07UUFDZixNQUFNLEVBQUUsQ0FBQztnQkFDUCxJQUFJLEVBQUUsUUFBUTtnQkFDZCxvQkFBb0IsRUFBRTtvQkFDcEIsSUFBSSxFQUFFLFFBQVE7b0JBQ2Qsb0JBQW9CLEVBQUUsSUFBSTtpQkFDM0I7YUFDRixDQUFDO1FBQ0YsSUFBSSxFQUFFO1lBQ0osV0FBVyxFQUFFLHNDQUFzQztTQUNwRDtLQUNGO0lBQ0QsTUFBTSxDQUFDLE9BQW9COztRQUN6QixNQUFNLFFBQVEsR0FBRyxPQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLG1DQUFJLFNBQVMsQ0FBZ0MsQ0FBQTtRQUNqRixPQUFPO1lBQ0wsT0FBTyxDQUFDLE9BQWlCO2dCQUN2QixNQUFNLE1BQU0sR0FBRyxPQUFPLENBQUMsVUFBVSxDQUFDLE9BQU8sRUFBRSxDQUFBO2dCQUMzQyxNQUFNLFFBQVEsR0FBRyxPQUFPLENBQUMsZ0JBQWdCLENBQUE7Z0JBRXpDLGtGQUFrRjtnQkFDbEYsTUFBTSxFQUFFLEdBQUcsSUFBSSxNQUFNLENBQUMsT0FBTyxDQUFDLE1BQU0sRUFBRSxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUE7Z0JBQ3BELElBQUksS0FBNkIsQ0FBQTtnQkFFakMsT0FBTyxDQUFDLEtBQUssR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEtBQUssSUFBSSxFQUFFLENBQUM7b0JBQzFDLE1BQU0sQ0FBQyxTQUFTLEVBQUUsTUFBTSxHQUFHLEVBQUUsRUFBRSxVQUFVLEdBQUcsRUFBRSxFQUFFLElBQUksR0FBRyxFQUFFLEVBQUUsU0FBUyxHQUFHLEVBQUUsQ0FBQyxHQUFHLEtBQUssQ0FBQTtvQkFDbEYsTUFBTSxVQUFVLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQTtvQkFDOUIsTUFBTSxRQUFRLEdBQUcsS0FBSyxDQUFDLEtBQUssR0FBRyxTQUFTLENBQUMsTUFBTSxDQUFBO29CQUUvQyxJQUFJLE9BQXFCLENBQUE7b0JBQ3pCLElBQUksQ0FBQzt3QkFDSCxPQUFPLEdBQUcsYUFBYSxDQUFDLGlCQUFpQixDQUFDLFVBQVUsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxDQUFBO29CQUNsRSxDQUFDOytCQUFPLENBQUM7d0JBQ1AsU0FBUTtvQkFDVixDQUFDO29CQUVELE1BQU0sZUFBZSxHQUFHLG1CQUFtQixDQUFDLElBQUksQ0FBQyxDQUFBO29CQUNqRCxJQUFJLGdCQUF3QixDQUFBO29CQUM1QixJQUFJLENBQUM7d0JBQ0gsZ0JBQWdCLEdBQUcsbUJBQW1CLENBQ3BDLHlCQUF5QixDQUN2QixPQUFPLEVBQ1AsUUFBUSxFQUNSLFlBQVksQ0FBQyxPQUFPLEVBQUUsRUFBRSxRQUFRLEVBQUUsZUFBZSxFQUFFLEVBQUUsTUFBTSxDQUFDLENBQzdELENBQ0YsQ0FBQTtvQkFDSCxDQUFDOytCQUFPLENBQUM7d0JBQ1AsU0FBUTtvQkFDVixDQUFDO29CQUVELE1BQU0sUUFBUSxHQUFHLGdCQUFnQixDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsV0FBVyxDQUFDLGdCQUFnQixFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQTtvQkFDaEcsTUFBTSxXQUFXLEdBQUcsR0FBRyxNQUFNLG9CQUFvQixVQUFVLEtBQUssUUFBUSxHQUFHLFNBQVMsZ0JBQWdCLENBQUE7b0JBRXBHLElBQUksV0FBVyxLQUFLLFNBQVMsRUFBRSxDQUFDO3dCQUM5QixPQUFPLENBQUMsTUFBTSxDQUFDOzRCQUNiLElBQUksRUFBRSxPQUFPOzRCQUNiLE9BQU8sRUFBRSw4QkFBOEIsT0FBTyxDQUFDLE1BQU0sWUFBWTs0QkFDakUsR0FBRyxDQUFDLEtBQWdCO2dDQUNsQixPQUFPLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLFVBQVUsRUFBRSxRQUFRLENBQUMsRUFBRSxXQUFXLENBQUMsQ0FBQTs0QkFDcEUsQ0FBQzt5QkFDRixDQUFDLENBQUE7b0JBQ0osQ0FBQztnQkFDSCxDQUFDO1lBQ0gsQ0FBQztTQUNGLENBQUE7SUFDSCxDQUFDO0NBQ0YsQ0FBQTtBQUVELGVBQWUsV0FBVyxDQUFBIn0=