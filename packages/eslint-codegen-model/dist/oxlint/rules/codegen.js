import { blockRe, indentBlock, normaliseGeneratedContent, parseBlockOptions, renderPreset, trimTrailingNewline } from "../../shared/codegen-block.js";
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
                // Create a fresh regex instance per Program visit to avoid shared lastIndex state
                const re = new RegExp(blockRe.source, blockRe.flags);
                let match;
                while ((match = re.exec(source)) !== null) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29kZWdlbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9veGxpbnQvcnVsZXMvY29kZWdlbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFFQSxPQUFPLEVBQ0wsT0FBTyxFQUNQLFdBQVcsRUFDWCx5QkFBeUIsRUFDekIsaUJBQWlCLEVBQ2pCLFlBQVksRUFDWixtQkFBbUIsRUFFcEIsTUFBTSwrQkFBK0IsQ0FBQTtBQXdCdEMsTUFBTSxXQUFXLEdBQWU7SUFDOUIsSUFBSSxFQUFFO1FBQ0osSUFBSSxFQUFFLFlBQVk7UUFDbEIsT0FBTyxFQUFFLE1BQU07UUFDZixJQUFJLEVBQUU7WUFDSixXQUFXLEVBQUUsc0NBQXNDO1NBQ3BEO0tBQ0Y7SUFDRCxNQUFNLENBQUMsT0FBb0I7UUFDekIsT0FBTztZQUNMLE9BQU8sQ0FBQyxPQUFpQjtnQkFDdkIsTUFBTSxNQUFNLEdBQUcsT0FBTyxDQUFDLFVBQVUsQ0FBQyxPQUFPLEVBQUUsQ0FBQTtnQkFDM0MsTUFBTSxRQUFRLEdBQUcsT0FBTyxDQUFDLGdCQUFnQixDQUFBO2dCQUV6QyxrRkFBa0Y7Z0JBQ2xGLE1BQU0sRUFBRSxHQUFHLElBQUksTUFBTSxDQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFBO2dCQUNwRCxJQUFJLEtBQTZCLENBQUE7Z0JBRWpDLE9BQU8sQ0FBQyxLQUFLLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxLQUFLLElBQUksRUFBRSxDQUFDO29CQUMxQyxNQUFNLENBQUMsU0FBUyxFQUFFLE1BQU0sR0FBRyxFQUFFLEVBQUUsVUFBVSxHQUFHLEVBQUUsRUFBRSxJQUFJLEdBQUcsRUFBRSxFQUFFLFNBQVMsR0FBRyxFQUFFLENBQUMsR0FBRyxLQUFLLENBQUE7b0JBQ2xGLE1BQU0sVUFBVSxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUE7b0JBQzlCLE1BQU0sUUFBUSxHQUFHLEtBQUssQ0FBQyxLQUFLLEdBQUcsU0FBUyxDQUFDLE1BQU0sQ0FBQTtvQkFFL0MsSUFBSSxPQUFxQixDQUFBO29CQUN6QixJQUFJLENBQUM7d0JBQ0gsT0FBTyxHQUFHLGlCQUFpQixDQUFDLFVBQVUsQ0FBQyxDQUFBO29CQUN6QyxDQUFDOytCQUFPLENBQUM7d0JBQ1AsU0FBUTtvQkFDVixDQUFDO29CQUVELE1BQU0sZUFBZSxHQUFHLG1CQUFtQixDQUFDLElBQUksQ0FBQyxDQUFBO29CQUNqRCxJQUFJLGdCQUF3QixDQUFBO29CQUM1QixJQUFJLENBQUM7d0JBQ0gsZ0JBQWdCLEdBQUcsbUJBQW1CLENBQ3BDLHlCQUF5QixDQUN2QixPQUFPLEVBQ1AsUUFBUSxFQUNSLFlBQVksQ0FBQyxPQUFPLEVBQUUsRUFBRSxRQUFRLEVBQUUsZUFBZSxFQUFFLEVBQUUsTUFBTSxDQUFDLENBQzdELENBQ0YsQ0FBQTtvQkFDSCxDQUFDOytCQUFPLENBQUM7d0JBQ1AsU0FBUTtvQkFDVixDQUFDO29CQUVELE1BQU0sUUFBUSxHQUFHLGdCQUFnQixDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsV0FBVyxDQUFDLGdCQUFnQixFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQTtvQkFDaEcsTUFBTSxXQUFXLEdBQUcsR0FBRyxNQUFNLG9CQUFvQixVQUFVLEtBQUssUUFBUSxHQUFHLFNBQVMsZ0JBQWdCLENBQUE7b0JBRXBHLElBQUksV0FBVyxLQUFLLFNBQVMsRUFBRSxDQUFDO3dCQUM5QixPQUFPLENBQUMsTUFBTSxDQUFDOzRCQUNiLElBQUksRUFBRSxPQUFPOzRCQUNiLE9BQU8sRUFBRSw4QkFBOEIsT0FBTyxDQUFDLE1BQU0sWUFBWTs0QkFDakUsR0FBRyxDQUFDLEtBQWdCO2dDQUNsQixPQUFPLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLFVBQVUsRUFBRSxRQUFRLENBQUMsRUFBRSxXQUFXLENBQUMsQ0FBQTs0QkFDcEUsQ0FBQzt5QkFDRixDQUFDLENBQUE7b0JBQ0osQ0FBQztnQkFDSCxDQUFDO1lBQ0gsQ0FBQztTQUNGLENBQUE7SUFDSCxDQUFDO0NBQ0YsQ0FBQTtBQUVELGVBQWUsV0FBVyxDQUFBIn0=