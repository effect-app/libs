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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29kZWdlbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9veGxpbnQvcnVsZXMvY29kZWdlbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFFQSxPQUFPLEVBQXFCLE9BQU8sRUFBRSxXQUFXLEVBQUUseUJBQXlCLEVBQUUsaUJBQWlCLEVBQUUsWUFBWSxFQUFFLG1CQUFtQixFQUFFLE1BQU0sK0JBQStCLENBQUE7QUF3QnhLLE1BQU0sV0FBVyxHQUFlO0lBQzlCLElBQUksRUFBRTtRQUNKLElBQUksRUFBRSxZQUFZO1FBQ2xCLE9BQU8sRUFBRSxNQUFNO1FBQ2YsSUFBSSxFQUFFO1lBQ0osV0FBVyxFQUFFLHNDQUFzQztTQUNwRDtLQUNGO0lBQ0QsTUFBTSxDQUFDLE9BQW9CO1FBQ3pCLE9BQU87WUFDTCxPQUFPLENBQUMsT0FBaUI7Z0JBQ3ZCLE1BQU0sTUFBTSxHQUFHLE9BQU8sQ0FBQyxVQUFVLENBQUMsT0FBTyxFQUFFLENBQUE7Z0JBQzNDLE1BQU0sUUFBUSxHQUFHLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQTtnQkFFekMsa0ZBQWtGO2dCQUNsRixNQUFNLEVBQUUsR0FBRyxJQUFJLE1BQU0sQ0FBQyxPQUFPLENBQUMsTUFBTSxFQUFFLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQTtnQkFDcEQsSUFBSSxLQUE2QixDQUFBO2dCQUVqQyxPQUFPLENBQUMsS0FBSyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsS0FBSyxJQUFJLEVBQUUsQ0FBQztvQkFDMUMsTUFBTSxDQUFDLFNBQVMsRUFBRSxNQUFNLEdBQUcsRUFBRSxFQUFFLFVBQVUsR0FBRyxFQUFFLEVBQUUsSUFBSSxHQUFHLEVBQUUsRUFBRSxTQUFTLEdBQUcsRUFBRSxDQUFDLEdBQUcsS0FBSyxDQUFBO29CQUNsRixNQUFNLFVBQVUsR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFBO29CQUM5QixNQUFNLFFBQVEsR0FBRyxLQUFLLENBQUMsS0FBSyxHQUFHLFNBQVMsQ0FBQyxNQUFNLENBQUE7b0JBRS9DLElBQUksT0FBcUIsQ0FBQTtvQkFDekIsSUFBSSxDQUFDO3dCQUNILE9BQU8sR0FBRyxpQkFBaUIsQ0FBQyxVQUFVLENBQUMsQ0FBQTtvQkFDekMsQ0FBQzsrQkFBTyxDQUFDO3dCQUNQLFNBQVE7b0JBQ1YsQ0FBQztvQkFFRCxNQUFNLGVBQWUsR0FBRyxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsQ0FBQTtvQkFDakQsSUFBSSxnQkFBd0IsQ0FBQTtvQkFDNUIsSUFBSSxDQUFDO3dCQUNILGdCQUFnQixHQUFHLG1CQUFtQixDQUNwQyx5QkFBeUIsQ0FDdkIsT0FBTyxFQUNQLFFBQVEsRUFDUixZQUFZLENBQUMsT0FBTyxFQUFFLEVBQUUsUUFBUSxFQUFFLGVBQWUsRUFBRSxFQUFFLE1BQU0sQ0FBQyxDQUM3RCxDQUNGLENBQUE7b0JBQ0gsQ0FBQzsrQkFBTyxDQUFDO3dCQUNQLFNBQVE7b0JBQ1YsQ0FBQztvQkFFRCxNQUFNLFFBQVEsR0FBRyxnQkFBZ0IsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLFdBQVcsQ0FBQyxnQkFBZ0IsRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUE7b0JBQ2hHLE1BQU0sV0FBVyxHQUFHLEdBQUcsTUFBTSxvQkFBb0IsVUFBVSxLQUFLLFFBQVEsR0FBRyxTQUFTLGdCQUFnQixDQUFBO29CQUVwRyxJQUFJLFdBQVcsS0FBSyxTQUFTLEVBQUUsQ0FBQzt3QkFDOUIsT0FBTyxDQUFDLE1BQU0sQ0FBQzs0QkFDYixJQUFJLEVBQUUsT0FBTzs0QkFDYixPQUFPLEVBQUUsOEJBQThCLE9BQU8sQ0FBQyxNQUFNLFlBQVk7NEJBQ2pFLEdBQUcsQ0FBQyxLQUFnQjtnQ0FDbEIsT0FBTyxLQUFLLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxVQUFVLEVBQUUsUUFBUSxDQUFDLEVBQUUsV0FBVyxDQUFDLENBQUE7NEJBQ3BFLENBQUM7eUJBQ0YsQ0FBQyxDQUFBO29CQUNKLENBQUM7Z0JBQ0gsQ0FBQztZQUNILENBQUM7U0FDRixDQUFBO0lBQ0gsQ0FBQztDQUNGLENBQUE7QUFFRCxlQUFlLFdBQVcsQ0FBQSJ9