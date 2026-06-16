#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";
import glob from "glob";
import { applyDefaults, blockRe, indentBlock, normaliseGeneratedContent, parseBlockOptions, renderPreset, trimTrailingNewline } from "./shared/codegen-block.js";
import { getExportedModelNames } from "./presets/model.js";
import { createModelTypeResolver } from "./shared/type-resolver.js";
const CONFIG_FILENAMES = ["codegen.config.json"];
function loadConfig(cwd, explicit) {
    const candidates = explicit ? [path.resolve(cwd, explicit)] : CONFIG_FILENAMES.map((f) => path.join(cwd, f));
    for (const candidate of candidates) {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
            const parsed = JSON.parse(fs.readFileSync(candidate, "utf8"));
            return parsed;
        }
    }
    if (explicit) {
        throw new Error(`Config not found: ${explicit}`);
    }
    return undefined;
}
const modelBlockRe = /\/\/ codegen:start[ \t]*\{[^}]*\bpreset:\s*model\b/;
const staticTypeModelBlockRe = /\/\/ codegen:start[ \t]*\{[^}]*\bpreset:\s*model\b[^}]*\bstatic:\s*true\b[^}]*\btype:\s*true\b/;
const staticMakeModelBlockRe = /\/\/ codegen:start[ \t]*\{[^}]*\bpreset:\s*model\b[^}]*\bstatic:\s*true\b[^}]*\bmake:\s*true\b/;
function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
/**
 * Keep each model's `Opaque` base-class clause in sync with the block mode (idempotent):
 * - make → `S.OpaqueShape<X.Type, X.Encoded, X.Make>`
 * - type → `S.OpaqueType<X.Type, X.Encoded>`
 * - plain → `S.Opaque<X, X.Encoded>` (revert)
 *
 * Only `Opaque`-family clauses for the model's own `Self`/`Encoded` are touched (matches
 * `<X|X.Type, X.Encoded[, X.Make]>`); `Class`/`TaggedClass` models are left untouched.
 */
function syncCtor(source, modelNames, mode) {
    let out = source;
    for (const name of modelNames) {
        const n = escapeRe(name);
        const re = new RegExp(`((?:[A-Za-z_$][\\w$]*\\.)?)(?:Opaque|OpaqueType|OpaqueShape)<\\s*${n}(?:\\.Type)?\\s*,\\s*${n}\\.Encoded(?:\\s*,\\s*${n}\\.Make)?\\s*>`, "g");
        const target = mode === "make"
            ? `$1OpaqueShape<${name}.Type, ${name}.Encoded, ${name}.Make>`
            : mode === "type"
                ? `$1OpaqueType<${name}.Type, ${name}.Encoded>`
                : `$1Opaque<${name}, ${name}.Encoded>`;
        out = out.replace(re, target);
    }
    return out;
}
function updateFile(filePath, source, defaults, resolver) {
    let changed = false;
    // Sync each model's Opaque ctor to the block mode (make → OpaqueShape, type → OpaqueType,
    // else plain Opaque). Done outside codegen blocks, on the class declarations. Only for files
    // that actually contain a model codegen block, so manual OpaqueType/Shape usage is untouched.
    if (modelBlockRe.test(source)) {
        const mode = staticMakeModelBlockRe.test(source)
            ? "make"
            : staticTypeModelBlockRe.test(source)
                ? "type"
                : "plain";
        const synced = syncCtor(source, getExportedModelNames(source), mode);
        if (synced !== source) {
            changed = true;
            source = synced;
        }
    }
    const next = source.replace(blockRe, (_match, indent, rawOptions, body, endIndent) => {
        const options = applyDefaults(parseBlockOptions(rawOptions), defaults);
        const existingContent = trimTrailingNewline(body);
        const generatedContent = trimTrailingNewline(normaliseGeneratedContent(options, filePath, renderPreset(options, { filename: filePath, existingContent }, source, resolver)));
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
    let config;
    let tsconfig;
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
        if (part === "--config") {
            const next = args[index + 1];
            if (!next) {
                throw new Error("Missing value for --config");
            }
            config = next;
            index++;
            continue;
        }
        if (part === "--tsconfig") {
            const next = args[index + 1];
            if (!next) {
                throw new Error("Missing value for --tsconfig");
            }
            tsconfig = path.resolve(process.cwd(), next);
            index++;
            continue;
        }
        throw new Error(`Unknown argument: ${part}`);
    }
    const result = { files, help: false };
    if (config !== undefined)
        result.config = config;
    if (tsconfig !== undefined)
        result.tsconfig = tsconfig;
    return result;
}
// A model block requests static literal interfaces via `static: true`.
const staticModelBlockRe = /\/\/ codegen:start[ \t]*\{[^}]*\bpreset:\s*model\b[^}]*\bstatic:\s*true\b/;
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
function findNearestTsconfig(fromDir) {
    let dir = fromDir;
    for (;;) {
        const candidate = path.join(dir, "tsconfig.json");
        if (fs.existsSync(candidate))
            return candidate;
        const parent = path.dirname(dir);
        if (parent === dir)
            return undefined;
        dir = parent;
    }
}
function run() {
    const { files, help, config, tsconfig } = parseArgs(process.argv.slice(2));
    if (help) {
        console.log("Usage: effect-app-codegen [--file <path>]... [--config <path>] [--tsconfig <path>]");
        console.log("Runs codegen blocks in the given files, or scans the current working tree when omitted.");
        console.log(`Loads ${CONFIG_FILENAMES.join(", ")} from cwd when present; --config overrides.`);
        console.log("--tsconfig enables `static` model blocks (type-checker-backed literal Encoded/Type).");
        return;
    }
    const defaults = loadConfig(process.cwd(), config);
    const targetFiles = files.length > 0 ? files : defaultFiles();
    const updated = [];
    const untouched = [];
    // Build the type resolver lazily, only if some target file requests static model blocks.
    const candidateFiles = targetFiles.filter((f) => fs.existsSync(f) && fs.statSync(f).isFile());
    const staticFiles = candidateFiles.filter((f) => staticModelBlockRe.test(fs.readFileSync(f, "utf8")));
    let resolver;
    if (staticFiles.length > 0) {
        const tsconfigPath = tsconfig !== null && tsconfig !== void 0 ? tsconfig : findNearestTsconfig(path.dirname(staticFiles[0]));
        if (!tsconfigPath) {
            throw new Error("static model blocks require a tsconfig; pass --tsconfig <path>");
        }
        resolver = createModelTypeResolver({ tsconfigPath, files: staticFiles });
    }
    for (const filePath of targetFiles) {
        if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
            throw new Error(`File not found: ${filePath}`);
        }
        const source = fs.readFileSync(filePath, "utf8");
        if (!source.includes("// codegen:start")) {
            continue;
        }
        if (updateFile(filePath, source, defaults, resolver)) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2xpLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL2NsaS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQ0EsT0FBTyxLQUFLLEVBQUUsTUFBTSxTQUFTLENBQUE7QUFDN0IsT0FBTyxLQUFLLElBQUksTUFBTSxXQUFXLENBQUE7QUFFakMsT0FBTyxJQUFJLE1BQU0sTUFBTSxDQUFBO0FBRXZCLE9BQU8sRUFBRSxhQUFhLEVBQUUsT0FBTyxFQUF3QixXQUFXLEVBQUUseUJBQXlCLEVBQUUsaUJBQWlCLEVBQUUsWUFBWSxFQUFFLG1CQUFtQixFQUFFLE1BQU0sMkJBQTJCLENBQUE7QUFDdEwsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sb0JBQW9CLENBQUE7QUFDMUQsT0FBTyxFQUFFLHVCQUF1QixFQUEwQixNQUFNLDJCQUEyQixDQUFBO0FBRTNGLE1BQU0sZ0JBQWdCLEdBQUcsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFBO0FBRWhELFNBQVMsVUFBVSxDQUFDLEdBQVcsRUFBRSxRQUFpQjtJQUNoRCxNQUFNLFVBQVUsR0FBRyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLEVBQUUsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsZ0JBQWdCLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFBO0lBQzVHLEtBQUssTUFBTSxTQUFTLElBQUksVUFBVSxFQUFFLENBQUM7UUFDbkMsSUFBSSxFQUFFLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQztZQUNoRSxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxZQUFZLENBQUMsU0FBUyxFQUFFLE1B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