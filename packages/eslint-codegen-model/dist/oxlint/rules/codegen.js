import { applyDefaults, blockRe, indentBlock, normaliseGeneratedContent, parseBlockOptions, renderPreset, trimTrailingNewline } from "../../shared/codegen-block.js";
const codegenRule = {
    meta: {
        type: "suggestion",
        fixable: "code",
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29kZWdlbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9veGxpbnQvcnVsZXMvY29kZWdlbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFFQSxPQUFPLEVBQUUsYUFBYSxFQUFxQixPQUFPLEVBQXdCLFdBQVcsRUFBRSx5QkFBeUIsRUFBRSxpQkFBaUIsRUFBRSxZQUFZLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQTtBQXlCN00sTUFBTSxXQUFXLEdBQWU7SUFDOUIsSUFBSSxFQUFFO1FBQ0osSUFBSSxFQUFFLFlBQVk7UUFDbEIsT0FBTyxFQUFFLE1BQU07UUFDZixJQUFJLEVBQUU7WUFDSixXQUFXLEVBQUUsc0NBQXNDO1NBQ3BEO0tBQ0Y7SUFDRCxNQUFNLENBQUMsT0FBb0I7O1FBQ3pCLE1BQU0sUUFBUSxHQUFHLE9BQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsbUNBQUksU0FBUyxDQUFnQyxDQUFBO1FBQ2pGLE9BQU87WUFDTCxPQUFPLENBQUMsT0FBaUI7Z0JBQ3ZCLE1BQU0sTUFBTSxHQUFHLE9BQU8sQ0FBQyxVQUFVLENBQUMsT0FBTyxFQUFFLENBQUE7Z0JBQzNDLE1BQU0sUUFBUSxHQUFHLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQTtnQkFFekMsa0ZBQWtGO2dCQUNsRixNQUFNLEVBQUUsR0FBRyxJQUFJLE1BQU0sQ0FBQyxPQUFPLENBQUMsTUFBTSxFQUFFLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQTtnQkFDcEQsSUFBSSxLQUE2QixDQUFBO2dCQUVqQyxPQUFPLENBQUMsS0FBSyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsS0FBSyxJQUFJLEVBQUUsQ0FBQztvQkFDMUMsTUFBTSxDQUFDLFNBQVMsRUFBRSxNQUFNLEdBQUcsRUFBRSxFQUFFLFVBQVUsR0FBRyxFQUFFLEVBQUUsSUFBSSxHQUFHLEVBQUUsRUFBRSxTQUFTLEdBQUcsRUFBRSxDQUFDLEdBQUcsS0FBSyxDQUFBO29CQUNsRixNQUFNLFVBQVUsR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFBO29CQUM5QixNQUFNLFFBQVEsR0FBRyxLQUFLLENBQUMsS0FBSyxHQUFHLFNBQVMsQ0FBQyxNQUFNLENBQUE7b0JBRS9DLElBQUksT0FBcUIsQ0FBQTtvQkFDekIsSUFBSSxDQUFDO3dCQUNILE9BQU8sR0FBRyxhQUFhLENBQUMsaUJBQWlCLENBQUMsVUFBVSxDQUFDLEVBQUUsUUFBUSxDQUFDLENBQUE7b0JBQ2xFLENBQUM7K0JBQU8sQ0FBQzt3QkFDUCxTQUFRO29CQUNWLENBQUM7b0JBRUQsTUFBTSxlQUFlLEdBQUcsbUJBQW1CLENBQUMsSUFBSSxDQUFDLENBQUE7b0JBQ2pELElBQUksZ0JBQXdCLENBQUE7b0JBQzVCLElBQUksQ0FBQzt3QkFDSCxnQkFBZ0IsR0FBRyxtQkFBbUIsQ0FDcEMseUJBQXlCLENBQ3ZCLE9BQU8sRUFDUCxRQUFRLEVBQ1IsWUFBWSxDQUFDLE9BQU8sRUFBRSxFQUFFLFFBQVEsRUFBRSxlQUFlLEVBQUUsRUFBRSxNQUFNLENBQUMsQ0FDN0QsQ0FDRixDQUFBO29CQUNILENBQUM7K0JBQU8sQ0FBQzt3QkFDUCxTQUFRO29CQUNWLENBQUM7b0JBRUQsTUFBTSxRQUFRLEdBQUcsZ0JBQWdCLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxXQUFXLENBQUMsZ0JBQWdCLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFBO29CQUNoRyxNQUFNLFdBQVcsR0FBRyxHQUFHLE1BQU0sb0JBQW9CLFVBQVUsS0FBSyxRQUFRLEdBQUcsU0FBUyxnQkFBZ0IsQ0FBQTtvQkFFcEcsSUFBSSxXQUFXLEtBQUssU0FBUyxFQUFFLENBQUM7d0JBQzlCLE9BQU8sQ0FBQyxNQUFNLENBQUM7NEJBQ2IsSUFBSSxFQUFFLE9BQU87NEJBQ2IsT0FBTyxFQUFFLDhCQUE4QixPQUFPLENBQUMsTUFBTSxZQUFZOzRCQUNqRSxHQUFHLENBQUMsS0FBZ0I7Z0NBQ2xCLE9BQU8sS0FBSyxDQUFDLGdCQUFnQixDQUFDLENBQUMsVUFBVSxFQUFFLFFBQVEsQ0FBQyxFQUFFLFdBQVcsQ0FBQyxDQUFBOzRCQUNwRSxDQUFDO3lCQUNGLENBQUMsQ0FBQTtvQkFDSixDQUFDO2dCQUNILENBQUM7WUFDSCxDQUFDO1NBQ0YsQ0FBQTtJQUNILENBQUM7Q0FDRixDQUFBO0FBRUQsZUFBZSxXQUFXLENBQUEifQ==