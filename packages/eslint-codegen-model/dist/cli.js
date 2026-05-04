#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";
import glob from "glob";
import { blockRe, indentBlock, normaliseGeneratedContent, parseBlockOptions, renderPreset, trimTrailingNewline } from "./shared/codegen-block.js";
function updateFile(filePath, source) {
    let changed = false;
    const next = source.replace(blockRe, (_match, indent, rawOptions, body, endIndent) => {
        const options = parseBlockOptions(rawOptions);
        const existingContent = trimTrailingNewline(body);
        const generatedContent = trimTrailingNewline(normaliseGeneratedContent(options, filePath, renderPreset(options, { filename: filePath, existingContent }, source)));
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
        if (updateFile(filePath, source)) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2xpLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL2NsaS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQ0EsT0FBTyxLQUFLLEVBQUUsTUFBTSxTQUFTLENBQUE7QUFDN0IsT0FBTyxLQUFLLElBQUksTUFBTSxXQUFXLENBQUE7QUFFakMsT0FBTyxJQUFJLE1BQU0sTUFBTSxDQUFBO0FBRXZCLE9BQU8sRUFDTCxPQUFPLEVBQ1AsV0FBVyxFQUNYLHlCQUF5QixFQUN6QixpQkFBaUIsRUFDakIsWUFBWSxFQUNaLG1CQUFtQixFQUNwQixNQUFNLDJCQUEyQixDQUFBO0FBRWxDLFNBQVMsVUFBVSxDQUFDLFFBQWdCLEVBQUUsTUFBYztJQUNsRCxJQUFJLE9BQU8sR0FBRyxLQUFLLENBQUE7SUFFbkIsTUFBTSxJQUFJLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FDekIsT0FBTyxFQUNQLENBQUMsTUFBTSxFQUFFLE1BQWMsRUFBRSxVQUFrQixFQUFFLElBQVksRUFBRSxTQUFpQixFQUFFLEVBQUU7UUFDOUUsTUFBTSxPQUFPLEdBQUcsaUJBQWlCLENBQUMsVUFBVSxDQUFDLENBQUE7UUFDN0MsTUFBTSxlQUFlLEdBQUcsbUJBQW1CLENBQUMsSUFBSSxDQUFDLENBQUE7UUFDakQsTUFBTSxnQkFBZ0IsR0FBRyxtQkFBbUIsQ0FDMUMseUJBQXlCLENBQ3ZCLE9BQU8sRUFDUCxRQUFRLEVBQ1IsWUFBWSxDQUFDLE9BQU8sRUFBRSxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsZUFBZSxFQUFFLEVBQUUsTUFBTSxDQUFDLENBQ3ZFLENBQ0YsQ0FBQTtRQUVELE1BQU0sUUFBUSxHQUFHLGdCQUFnQixDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsV0FBVyxDQUFDLGdCQUFnQixFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQTtRQUNoRyxNQUFNLFdBQVcsR0FBRyxHQUFHLE1BQU0sb0JBQW9C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