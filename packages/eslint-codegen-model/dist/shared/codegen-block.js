import yaml from "js-yaml";
import { barrel } from "../presets/barrel.js";
import { meta as metaPreset } from "../presets/meta.js";
import { model } from "../presets/model.js";
import { modelFacade } from "../presets/model-facade.js";
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
export function applyDefaults(options, defaults) {
    if (!defaults)
        return options;
    const presetDefaults = defaults[options.preset];
    if (!presetDefaults)
        return options;
    return { ...presetDefaults, ...options, preset: options.preset };
}
export function renderPreset(options, meta, fullSource, resolver) {
    const { preset, ...rest } = options;
    switch (preset) {
        case "barrel":
            return barrel({ meta, options: rest }, undefined);
        case "meta":
            return metaPreset({ meta, options: rest }, undefined);
        case "model":
            return model({ meta, options: rest }, fullSource, resolver);
        case "modelFacade":
            return modelFacade({ options: rest });
        default:
            throw new Error(`Unknown codegen preset: ${preset}`);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29kZWdlbi1ibG9jay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9zaGFyZWQvY29kZWdlbi1ibG9jay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLElBQUksTUFBTSxTQUFTLENBQUE7QUFDMUIsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLHNCQUFzQixDQUFBO0FBQzdDLE9BQU8sRUFBRSxJQUFJLElBQUksVUFBVSxFQUFFLE1BQU0sb0JBQW9CLENBQUE7QUFDdkQsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHFCQUFxQixDQUFBO0FBQzNDLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQTtBQVl4RCxNQUFNLENBQUMsTUFBTSxPQUFPLEdBQUcsaUdBQWlHLENBQUE7QUFFeEgsTUFBTSxVQUFVLEdBQUcsY0FBYyxDQUFBO0FBQ2pDLE1BQU0sT0FBTyxHQUFHLGdDQUFnQyxDQUFBO0FBRWhELE1BQU0sVUFBVSxRQUFRLENBQUMsS0FBYztJQUNyQyxPQUFPLE9BQU8sS0FBSyxLQUFLLFFBQVEsSUFBSSxLQUFLLEtBQUssSUFBSSxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQTtBQUM3RSxDQUFDO0FBRUQsTUFBTSxVQUFVLGNBQWMsQ0FBQyxLQUFjO0lBQzNDLE9BQU8sUUFBUSxDQUFDLEtBQUssQ0FBQyxJQUFJLE9BQU8sS0FBSyxDQUFDLFFBQVEsQ0FBQyxLQUFLLFFBQVEsQ0FBQTtBQUMvRCxDQUFDO0FBRUQsTUFBTSxVQUFVLGlCQUFpQixDQUFDLEtBQWE7SUFDN0MsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQTtJQUMvQixJQUFJLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7UUFDNUIsTUFBTSxJQUFJLEtBQUssQ0FBQyw0QkFBNEIsS0FBSyxFQUFFLENBQUMsQ0FBQTtJQUN0RCxDQUFDO0lB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