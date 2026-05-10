import yaml from "js-yaml";
import { barrel } from "../presets/barrel.js";
import { meta as metaPreset } from "../presets/meta.js";
import { model } from "../presets/model.js";
export const blockRe = /^([ \t]*)\/\/ codegen:start[ \t]*(\{.*\})[ \t]*$\n?([\s\S]*?)^([ \t]*)\/\/ codegen:end[ \t]*$/gm;
const tsSourceRe = /\.[cm]?tsx?$/;
const jsExtRe = /(["'])(\.{1,2}\/[^"']+)\.js\1/g;
export function isRecord(input) {
    return typeof input === "object" && input !== null && !Array.isArray(input);
}
export function isBlockOptions(input) {
    return isRecord(input) && typeof input["preset"] === "string";
}
export function parseBlockOptions(input) {
    const parsed = yaml.load(input);
    if (!isBlockOptions(parsed)) {
        throw new Error(`Invalid codegen options: ${input}`);
    }
    return parsed;
}
export function trimTrailingNewline(input) {
    return input.endsWith("\n") ? input.slice(0, -1) : input;
}
export function isTypeScriptSource(filePath) {
    return tsSourceRe.test(filePath);
}
export function shouldStripJsExtensions(options, filePath) {
    return options.preset === "barrel"
        && options["jsExtensions"] === false
        && isTypeScriptSource(filePath);
}
export function normaliseGeneratedContent(options, filePath, content) {
    if (!shouldStripJsExtensions(options, filePath)) {
        return content;
    }
    return content.replace(jsExtRe, "$1$2$1");
}
export function indentBlock(content, indent) {
    if (indent.length === 0) {
        return content;
    }
    return content
        .split("\n")
        .map((line) => line.length === 0 ? line : `${indent}${line}`)
        .join("\n");
}
export function renderPreset(options, meta, fullSource) {
    const { preset, ...rest } = options;
    switch (preset) {
        case "barrel":
            return barrel({ meta, options: rest }, undefined);
        case "meta":
            return metaPreset({ meta, options: rest }, undefined);
        case "model":
            return model({ meta, options: rest }, fullSource);
        default:
            throw new Error(`Unknown codegen preset: ${preset}`);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29kZWdlbi1ibG9jay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9zaGFyZWQvY29kZWdlbi1ibG9jay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLElBQUksTUFBTSxTQUFTLENBQUE7QUFDMUIsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLHNCQUFzQixDQUFBO0FBQzdDLE9BQU8sRUFBRSxJQUFJLElBQUksVUFBVSxFQUFFLE1BQU0sb0JBQW9CLENBQUE7QUFDdkQsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHFCQUFxQixDQUFBO0FBVzNDLE1BQU0sQ0FBQyxNQUFNLE9BQU8sR0FBRyxpR0FBaUcsQ0FBQTtBQUV4SCxNQUFNLFVBQVUsR0FBRyxjQUFjLENBQUE7QUFDakMsTUFBTSxPQUFPLEdBQUcsZ0NBQWdDLENBQUE7QUFFaEQsTUFBTSxVQUFVLFFBQVEsQ0FBQyxLQUFjO0lBQ3JDLE9BQU8sT0FBTyxLQUFLLEtBQUssUUFBUSxJQUFJLEtBQUssS0FBSyxJQUFJLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFBO0FBQzdFLENBQUM7QUFFRCxNQUFNLFVBQVUsY0FBYyxDQUFDLEtBQWM7SUFDM0MsT0FBTyxRQUFRLENBQUMsS0FBSyxDQUFDLElBQUksT0FBTyxLQUFLLENBQUMsUUFBUSxDQUFDLEtBQUssUUFBUSxDQUFBO0FBQy9ELENBQUM7QUFFRCxNQUFNLFVBQVUsaUJBQWlCLENBQUMsS0FBYTtJQUM3QyxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFBO0lBQy9CLElBQUksQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQztRQUM1QixNQUFNLElBQUksS0FBSyxDQUFDLDRCQUE0QixLQUFLLEVBQUUsQ0FBQyxDQUFBO0lBQ3RELENBQUM7SUFDRCxPQUFPLE1BQU0sQ0FBQTtBQUNmLENBQUM7QUFFRCxNQUFNLFVBQVUsbUJBQW1CLENBQUMsS0FBYTtJQUMvQyxPQUFPLEtBQUssQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQTtBQUMxRCxDQUFDO0FBRUQsTUFBTSxVQUFVLGtCQUFrQixDQUFDLFFBQWdCO0lBQ2pELE9BQU8sVUFBVSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQTtBQUNsQyxDQUFDO0FBRUQsTUFBTSxVQUFVLHVCQUF1QixDQUFDLE9BQXFCLEVBQUUsUUFBZ0I7SUFDN0UsT0FBTyxPQUFPLENBQUMsTUFBTSxLQUFLLFFBQVE7V0FDN0IsT0FBTyxDQUFDLGNBQWMsQ0FBQyxLQUFLLEtBQUs7V0FDakMsa0JBQWtCLENBQUMsUUFBUSxDQUFDLENBQUE7QUFDbkMsQ0FBQztBQUVELE1BQU0sVUFBVSx5QkFBeUIsQ0FDdkMsT0FBcUIsRUFDckIsUUFBZ0IsRUFDaEIsT0FBZTtJQUVmLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxPQUFPLEVBQUUsUUFBUSxDQUFDLEVBQUUsQ0FBQztRQUNoRCxPQUFPLE9BQU8sQ0FBQTtJQUNoQixDQUFDO0lBQ0QsT0FBTyxPQUFPLENBQUMsT0FBTyxDQUFDLE9BQU8sRUFBRSxRQUFRLENBQUMsQ0FBQTtBQUMzQyxDQUFDO0FBRUQsTUFBTSxVQUFVLFdBQVcsQ0FBQyxPQUFlLEVBQUUsTUFBYztJQUN6RCxJQUFJLE1BQU0sQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7UUFDeEIsT0FBTyxPQUFPLENBQUE7SUFDaEIsQ0FBQztJQUNELE9BQU8sT0FBTztTQUNYLEtBQUssQ0FBQyxJQUFJLENBQUM7U0FDWCxHQUFHLENBQUMsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxNQUFNLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEdBQUcsTUFBTSxHQUFHLElBQUksRUFBRSxDQUFDO1NBQzVELElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQTtBQUNmLENBQUM7QUFFRCxNQUFNLFVBQVUsWUFBWSxDQUFDLE9BQXFCLEVBQUUsSUFBaUIsRUFBRSxVQUFtQjtJQUN4RixNQUFNLEVBQUUsTUFBTSxFQUFFLEdBQUcsSUFBSSxFQUFFLEdBQUcsT0FBTyxDQUFBO0lBQ25DLFFBQVEsTUFBTSxFQUFFLENBQUM7UUFDZixLQUFLLFFBQVE7WUFDWCxPQUFPLE1BQU0sQ0FBQyxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsSUFBK0MsRUFBRSxFQUFFLFNBQVMsQ0FBQyxDQUFBO1FBQzlGLEtBQUssTUFBTTtZQUNULE9BQU8sVUFBVSxDQUFDLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxJQUFtRCxFQUFFLEVBQUUsU0FBUyxDQUFDLENBQUE7UUFDdEcsS0FBSyxPQUFPO1lBQ1YsT0FBTyxLQUFLLENBQUMsRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUFFLElBQThDLEVBQUUsRUFBRSxVQUFVLENBQUMsQ0FBQTtRQUM3RjtZQUNFLE1BQU0sSUFBSSxLQUFLLENBQUMsMkJBQTJCLE1BQU0sRUFBRSxDQUFDLENBQUE7SUFDeEQsQ0FBQztBQUNILENBQUMifQ==