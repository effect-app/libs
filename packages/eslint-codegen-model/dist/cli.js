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
const facadeModelBlockRe = /\/\/ codegen:start[ \t]*\{[^}]*\bpreset:\s*model\b[^}]*\bfacade:\s*true\b/;
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
function findMatchingBrace(source, openIndex) {
    let depth = 0;
    let quote;
    let escaped = false;
    let lineComment = false;
    let blockComment = false;
    for (let index = openIndex; index < source.length; index++) {
        const char = source[index];
        const next = source[index + 1];
        if (lineComment) {
            if (char === "\n")
                lineComment = false;
            continue;
        }
        if (blockComment) {
            if (char === "*" && next === "/") {
                blockComment = false;
                index++;
            }
            continue;
        }
        if (quote) {
            if (escaped) {
                escaped = false;
            }
            else if (char === "\\") {
                escaped = true;
            }
            else if (char === quote) {
                quote = undefined;
            }
            continue;
        }
        if (char === "/" && next === "/") {
            lineComment = true;
            index++;
            continue;
        }
        if (char === "/" && next === "*") {
            blockComment = true;
            index++;
            continue;
        }
        if (char === "\"" || char === "'" || char === "`") {
            quote = char;
            continue;
        }
        if (char === "{") {
            depth++;
            continue;
        }
        if (char === "}") {
            depth--;
            if (depth === 0)
                return index;
        }
    }
    return -1;
}
function findClassBodyOpen(source, start) {
    let parenDepth = 0;
    let bracketDepth = 0;
    let quote;
    let escaped = false;
    let lineComment = false;
    let blockComment = false;
    for (let index = start; index < source.length; index++) {
        const char = source[index];
        const next = source[index + 1];
        if (lineComment) {
            if (char === "\n")
                lineComment = false;
            continue;
        }
        if (blockComment) {
            if (char === "*" && next === "/") {
                blockComment = false;
                index++;
            }
            continue;
        }
        if (quote) {
            if (escaped) {
                escaped = false;
            }
            else if (char === "\\") {
                escaped = true;
            }
            else if (char === quote) {
                quote = undefined;
            }
            continue;
        }
        if (char === "/" && next === "/") {
            lineComment = true;
            index++;
            continue;
        }
        if (char === "/" && next === "*") {
            blockComment = true;
            index++;
            continue;
        }
        if (char === "\"" || char === "'" || char === "`") {
            quote = char;
            continue;
        }
        if (char === "(") {
            parenDepth++;
            continue;
        }
        if (char === ")") {
            parenDepth--;
            continue;
        }
        if (char === "[") {
            bracketDepth++;
            continue;
        }
        if (char === "]") {
            bracketDepth--;
            continue;
        }
        if (char === "{" && parenDepth === 0 && bracketDepth === 0) {
            return index;
        }
    }
    return -1;
}
function findClassEnd(source, start) {
    const openIndex = findClassBodyOpen(source, start);
    if (openIndex === -1)
        return -1;
    const closeIndex = findMatchingBrace(source, openIndex);
    return closeIndex === -1 ? -1 : closeIndex + 1;
}
function modelSchemaPrefix(classText) {
    var _a;
    const match = /\bextends\s+((?:[A-Za-z_$][\w$]*\.)?)(?:Opaque|OpaqueType|OpaqueShape)\s*</.exec(classText);
    return (_a = match === null || match === void 0 ? void 0 : match[1]) !== null && _a !== void 0 ? _a : "S.";
}
function schemaName(prefix) {
    return prefix.endsWith(".") ? prefix.slice(0, -1) : prefix;
}
function schemaOption(prefix) {
    const name = schemaName(prefix);
    return name.length === 0 ? `, schema: ""` : `, schema: ${name}`;
}
function syncFacadeSourceCtor(classText, name) {
    const n = escapeRe(name);
    const re = new RegExp(`((?:[A-Za-z_$][\\w$]*\\.)?)(?:Opaque|OpaqueType|OpaqueShape)<\\s*(?:${n}|_${n})(?:\\.Type)?\\s*(?:,\\s*(?:${n}|_${n})\\.Encoded(?:\\s*,\\s*(?:${n}|_${n})\\.Make)?)?\\s*>`, "g");
    return classText.replace(re, `$1Opaque<_${name}>`);
}
function facadeClassLine(name, prefix) {
    return `export class ${name} extends ${prefix}OpaqueFacadeClass<${name}, ${name}.Encoded, ${name}.Make, ${name}.DecodingServices, ${name}.EncodingServices>()(_${name}) {}`;
}
function syncFacade(source, modelNames, enabled) {
    let out = source;
    for (const name of modelNames) {
        const n = escapeRe(name);
        if (enabled) {
            const existingClass = new RegExp(`(^|\\n)\\s*export\\s+class\\s+${n}\\s+extends\\s+(?:[A-Za-z_$][\\w$]*\\.)?OpaqueFacade(?:Class)?\\s*<`);
            const existingConst = new RegExp(`(^|\\n)\\s*export\\s+const\\s+${n}\\s*:\\s*${n}\\.Schema\\s*=`);
            if (existingClass.test(out) || existingConst.test(out)) {
                out = out.replace(new RegExp(`(OpaqueFacade(?:Class)?<\\s*)${n}(?:\\.Type)?(\\s*,\\s*${n}\\.Encoded\\s*,\\s*${n}\\.Make)(?:\\s*,\\s*${n}\\.DecodingServices\\s*,\\s*${n}\\.EncodingServices)?(\\s*>)`, "g"), `$1${name}$2, ${name}.DecodingServices, ${name}.EncodingServices$3`);
                const privateClassRe = new RegExp(`(^|\\n)(\\s*)class\\s+_${n}\\b`);
                const privateMatch = privateClassRe.exec(out);
                if (privateMatch) {
                    const start = privateMatch.index + privateMatch[1].length;
                    const end = findClassEnd(out, start);
                    if (end !== -1) {
                        out = `${out.slice(0, start)}${syncFacadeSourceCtor(out.slice(start, end), name)}${out.slice(end)}`;
                    }
                }
                const facadeBlock = new RegExp(`// codegen:start[^\\n]*\\{[^}]*\\bpreset:\\s*modelFacade\\b[^}]*\\bclassName:\\s*_${n}\\b[^}]*\\}[\\s\\S]*?export\\s+(?:const|class)\\s+${n}\\b`);
                if (!facadeBlock.test(out)) {
                    const facadeLine = new RegExp(`(^|\\n)([ \\t]*)export\\s+const\\s+${n}\\s*:\\s*${n}\\.Schema\\s*=\\s*((?:(?:[A-Za-z_$][\\w$]*\\.)?)OpaqueFacade<\\s*${n}\\s*,\\s*${n}\\.Encoded\\s*,\\s*${n}\\.Make(?:\\s*,\\s*${n}\\.DecodingServices\\s*,\\s*${n}\\.EncodingServices)?\\s*>\\(\\)\\(\\s*_${n}\\s*\\))`);
                    out = out.replace(facadeLine, (_match, lineStart, indent, expression) => {
                        var _a;
                        var _b;
                        const prefix = (_b = (_a = /^((?:[A-Za-z_$][\w$]*\.)?)OpaqueFacade/.exec(expression)) === null || _a === void 0 ? void 0 : _a[1]) !== null && _b !== void 0 ? _b : "";
                        return [
                            `${lineStart}${indent}// codegen:start {preset: modelFacade, className: _${name}${schemaOption(prefix)}}`,
                            `${indent}${facadeClassLine(name, prefix)}`,
                            `${indent}// codegen:end`
                        ].join("\n");
                    });
                }
                continue;
            }
            const classRe = new RegExp(`(^|\\n)(\\s*)export\\s+class\\s+${n}\\b`);
            const match = classRe.exec(out);
            if (!match)
                continue;
            const start = match.index + match[1].length;
            const end = findClassEnd(out, start);
            if (end === -1)
                continue;
            const classText = out.slice(start, end);
            const indent = match[2];
            const prefix = modelSchemaPrefix(classText);
            const privateClass = syncFacadeSourceCtor(classText.replace(new RegExp(`^${indent}export\\s+class\\s+${n}\\b`), `${indent}class _${name}`), name);
            const facade = [
                `${indent}// codegen:start {preset: modelFacade, className: _${name}${schemaOption(prefix)}}`,
                `${indent}${facadeClassLine(name, prefix)}`,
                `${indent}// codegen:end`
            ].join("\n");
            out = `${out.slice(0, start)}${privateClass}\n${facade}${out.slice(end)}`;
        }
        else {
            const classRe = new RegExp(`(^|\\n)(\\s*)class\\s+_${n}\\b`);
            const match = classRe.exec(out);
            if (!match)
                continue;
            const start = match.index + match[1].length;
            const end = findClassEnd(out, start);
            if (end === -1)
                continue;
            const classText = out.slice(start, end);
            const indent = match[2];
            const exportedClass = classText.replace(new RegExp(`^${indent}class\\s+_${n}\\b`), `${indent}export class ${name}`);
            const facadeRe = new RegExp(`\\n${indent}(?:// codegen:start[^\\n]*\\{[^}]*\\bpreset:\\s*modelFacade\\b[^}]*\\}\\n)?${indent}export\\s+(?:const\\s+${n}\\s*:\\s*${n}\\.Schema\\s*=\\s*(?:[A-Za-z_$][\\w$]*\\.)?OpaqueFacade<\\s*${n}(?:\\.Type)?\\s*,\\s*${n}\\.Encoded\\s*,\\s*${n}\\.Make(?:\\s*,\\s*${n}\\.DecodingServices\\s*,\\s*${n}\\.EncodingServices)?\\s*>\\(\\)\\(\\s*_${n}\\s*\\)|class\\s+${n}\\s+extends\\s+(?:[A-Za-z_$][\\w$]*\\.)?OpaqueFacade(?:Class)?<\\s*${n}\\s*,\\s*${n}\\.Encoded\\s*,\\s*${n}\\.Make\\s*,\\s*${n}\\.DecodingServices\\s*,\\s*${n}\\.EncodingServices\\s*>\\(\\)\\(\\s*_${n}\\s*\\)\\s*\\{\\})(?:\\n${indent}// codegen:end)?`);
            out = `${out.slice(0, start)}${exportedClass}${out.slice(end)}`.replace(facadeRe, "");
        }
    }
    return out;
}
function syncModelSource(source) {
    // Sync each model's Opaque ctor to the block mode (make → OpaqueShape, type → OpaqueType,
    // else plain Opaque). Done outside codegen blocks, on the class declarations. Only for files
    // that actually contain a model codegen block, so manual OpaqueType/Shape usage is untouched.
    if (modelBlockRe.test(source)) {
        const facade = facadeModelBlockRe.test(source);
        const mode = staticMakeModelBlockRe.test(source)
            ? "make"
            : staticTypeModelBlockRe.test(source)
                ? "type"
                : "plain";
        const modelNames = getExportedModelNames(source);
        return facade ? syncFacade(source, modelNames, true) : syncCtor(syncFacade(source, modelNames, false), modelNames, mode);
    }
    return source;
}
function updateFile(filePath, source, defaults, resolver) {
    let changed = false;
    const synced = syncModelSource(source);
    if (synced !== source) {
        changed = true;
        source = synced;
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
// A model block requests type-checker-backed literal interfaces via `static: true`
// or a shallow facade.
const staticModelBlockRe = /\/\/ codegen:start[ \t]*\{[^}]*\bpreset:\s*model\b[^}]*\b(?:static|facade):\s*true\b/;
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
    const preSynced = new Set();
    for (const filePath of staticFiles) {
        const source = fs.readFileSync(filePath, "utf8");
        const synced = syncModelSource(source);
        if (synced !== source) {
            fs.writeFileSync(filePath, synced);
            preSynced.add(filePath);
        }
    }
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
        else if (preSynced.has(filePath)) {
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