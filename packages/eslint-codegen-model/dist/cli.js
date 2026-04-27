#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const glob = __importStar(require("glob"));
const yaml = __importStar(require("js-yaml"));
const barrel_1 = require("./presets/barrel");
const meta_1 = require("./presets/meta");
const model_1 = require("./presets/model");
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
function shouldStripJsExtensions(options, filePath) {
    return options.preset === "barrel"
        && options["jsExtensions"] === false
        && isTypeScriptSource(filePath);
}
function isTypeScriptSource(filePath) {
    return /\.[cm]?tsx?$/.test(filePath);
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
            return (0, barrel_1.barrel)({ meta, options: rest }, undefined);
        case "meta":
            return (0, meta_1.meta)({ meta, options: rest }, undefined);
        case "model":
            return (0, model_1.model)({ meta, options: rest }, undefined);
        default:
            throw new Error(`Unknown codegen preset: ${preset}`);
    }
}
function updateFile(filePath) {
    const source = fs.readFileSync(filePath, "utf8");
    let changed = false;
    const next = source.replace(blockRe, (_match, indent, rawOptions, body, endIndent) => {
        const options = parseBlockOptions(rawOptions);
        const existingContent = trimTrailingNewline(body);
        const generatedContent = trimTrailingNewline(normaliseGeneratedContent(options, filePath, renderPreset(options, {
            filename: filePath,
            existingContent
        })));
        const nextBody = generatedContent.length > 0 ? `${indentBlock(generatedContent, indent)}\n` : "";
        const replacement = `${indent}// codegen:start ${rawOptions}\n${nextBody}${endIndent}// codegen:end`;
        if (replacement !== _match) {
            changed = true;
        }
        return replacement;
    });
    if (next !== source) {
        fs.writeFileSync(filePath, next);
    }
    return changed;
}
function parseArgs(args) {
    const files = [];
    for (let index = 0; index < args.length; index++) {
        const part = args[index];
        if (part === "--help" || part === "-h") {
            return { files, help: true };
        }
        if (part === "--file") {
            const next = args[index + 1];
            if (!next) {
                throw new Error("Missing value for --file");
            }
            files.push(path.resolve(process.cwd(), next));
            index++;
            continue;
        }
        throw new Error(`Unknown argument: ${part}`);
    }
    return { files, help: false };
}
function defaultFiles() {
    return glob
        .sync("**/*.{ts,tsx,mts,cts}", {
        cwd: process.cwd(),
        nodir: true,
        ignore: [
            "**/node_modules/**",
            "**/dist/**",
            "**/build/**",
            "**/.git/**"
        ]
    })
        .map((filePath) => path.resolve(process.cwd(), filePath));
}
function run() {
    const { files, help } = parseArgs(process.argv.slice(2));
    if (help) {
        console.log("Usage: effect-app-codegen [--file <path>]...");
        console.log("Runs codegen blocks in the given files, or scans the current working tree when omitted.");
        return;
    }
    const targetFiles = files.length > 0 ? files : defaultFiles();
    const updated = [];
    const untouched = [];
    for (const filePath of targetFiles) {
        if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
            throw new Error(`File not found: ${filePath}`);
        }
        const source = fs.readFileSync(filePath, "utf8");
        if (!source.includes("// codegen:start")) {
            continue;
        }
        if (updateFile(filePath)) {
            updated.push(path.relative(process.cwd(), filePath));
        }
        else {
            untouched.push(path.relative(process.cwd(), filePath));
        }
    }
    console.log(`codegen: ${updated.length} updated, ${untouched.length} unchanged`);
    for (const filePath of updated) {
        console.log(`updated ${filePath}`);
    }
}
try {
    run();
}
catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2xpLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL2NsaS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFDQSxNQUFZLEVBQUUsb0NBQWU7QUFDN0IsTUFBWSxJQUFJLHNDQUFpQjtBQUVqQyxNQUFZLElBQUksaUNBQVk7QUFDNUIsTUFBWSxJQUFJLG9DQUFlO0FBRS9CLDZDQUF5QztBQUN6Qyx5Q0FBbUQ7QUFDbkQsMkNBQXVDO0FBV3ZDLE1BQU0sT0FBTyxHQUFHLGlHQUFpRyxDQUFBO0FBRWpILFNBQVMsUUFBUSxDQUFDLEtBQWM7SUFDOUIsT0FBTyxPQUFPLEtBQUssS0FBSyxRQUFRLElBQUksS0FBSyxLQUFLLElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUE7QUFDN0UsQ0FBQztBQUVELFNBQVMsY0FBYyxDQUFDLEtBQWM7SUFDcEMsT0FBTyxRQUFRLENBQUMsS0FBSyxDQUFDLElBQUksT0FBTyxLQUFLLENBQUMsUUFBUSxDQUFDLEtBQUssUUFBUSxDQUFBO0FBQy9ELENBQUM7QUFFRCxTQUFTLGlCQUFpQixDQUFDLEtBQWE7SUFDdEMsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQTtJQUMvQixJQUFJLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7UUFDNUIsTUFBTSxJQUFJLEtBQUssQ0FBQyw0QkFBNEIsS0FBSyxFQUFFLENBQUMsQ0FBQTtJQUN0RCxDQUFDO0lBQ0QsT0FBTyxNQUFNLENBQUE7QUFDZixDQUFDO0FBRUQsU0FBUyxtQkFBbUIsQ0FBQyxLQUFhO0lBQ3hDLE9BQU8sS0FBSyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENB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