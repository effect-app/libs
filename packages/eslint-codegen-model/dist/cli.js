#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";
import glob from "glob";
import { applyDefaults, blockRe, indentBlock, normaliseGeneratedContent, parseBlockOptions, renderPreset, trimTrailingNewline } from "./shared/codegen-block.js";
import { getExportedModelNames, getFacadeableModelNames } from "./presets/model.js";
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
    const rewritten = classText.replace(re, `$1Opaque<_${name}>`);
    // The body moves onto the private `_X`, but the public facade `X` is declared
    // AFTER it. Member-access self-references (`X.fields`, `X.someStatic`) would be
    // use-before-declaration, so point them at `_X` (structurally equivalent, declared
    // first). Keep namespace TYPE members (`X.Encoded`/`Make`/`Type`/services) on `X`.
    // NOTE: only the `X.` (member-access) form is rewritten — a bare `\bX\b` rewrite
    // would also corrupt `TaggedStruct("X")` tag strings. Bare value self-refs
    // (`S.decodeTo(X, ...)`) in a static body are rare; such models stay standard.
    const selfValueRef = new RegExp(`\\b${n}\\.(?!(?:Encoded|Make|Type|DecodingServices|EncodingServices)\\b)`, "g");
    return rewritten.replace(selfValueRef, `_${name}.`);
}
function facadeClassLine(name, prefix) {
    return `export class ${name} extends ${prefix}OpaqueFacadeClass<${name}, ${name}.Encoded, ${name}.Make, ${name}.DecodingServices, ${name}.EncodingServices>()(_${name}) {}`;
}
// If `classText` is a no-statics `export class X extends (S.)Opaque<X, X.Encoded>()(STRUCT) {}`
// (empty body), return the private as a plain struct const `const _X = STRUCT`
// (lighter than the Opaque class). Returns null for any body content (statics,
// getters, methods) or non-Opaque bases — those keep the class form.
function tryStructPrivate(classText, name, indent) {
    const open = findClassBodyOpen(classText, 0);
    if (open === -1)
        return null;
    const close = findMatchingBrace(classText, open);
    if (close === -1)
        return null;
    const body = classText.slice(open + 1, close).replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").trim();
    if (body.length > 0)
        return null; // has statics/getters/methods -> keep class
    // Extract STRUCT from `extends (prefix)Opaque<X, X.Encoded>()(STRUCT)`.
    const m = /\bextends\s+(?:[A-Za-z_$][\w$]*\.)?Opaque\s*<[^(]*>\s*\(\s*\)\s*\(/.exec(classText.slice(0, open));
    if (!m)
        return null; // OpaqueType/OpaqueShape/Class/etc -> keep class form
    const argOpen = m.index + m[0].length - 1; // index of the `(` before STRUCT
    let depth = 0;
    let k = argOpen;
    for (; k < classText.length; k++) {
        if (classText[k] === "(")
            depth++;
        else if (classText[k] === ")") {
            depth--;
            if (depth === 0)
                break;
        }
    }
    const struct = classText.slice(argOpen + 1, k).trim();
    return `${indent}const _${name} = ${struct}`;
}
function syncFacade(source, modelNames, enabled) {
    var _a, _b;
    let out = source;
    for (const name of modelNames) {
        const n = escapeRe(name);
        if (enabled) {
            // Base mode: the facade is the generated `class __X extends OpaqueFacadeClass<...>()(_X)`
            // (owned by its modelFacade block); the user owns `export class X extends __X { ...statics... }`.
            // Leave both alone — only the block preset regenerates `__X`.
            const baseMode = new RegExp(`(^|\\n)\\s*class\\s+__${n}\\s+extends\\s+(?:[A-Za-z_$][\\w$]*\\.)?OpaqueFacadeClass\\s*<`);
            if (baseMode.test(out))
                continue;
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
                        const pIndent = privateMatch[2];
                        const ct = out.slice(start, end);
                        const replacement = (_a = tryStructPrivate(ct, name, pIndent)) !== null && _a !== void 0 ? _a : syncFacadeSourceCtor(ct, name);
                        out = `${out.slice(0, start)}${replacement}${out.slice(end)}`;
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
            // No-statics `S.Opaque` model -> emit the private as a plain `S.Struct` const
            // (lighter type; ~-14.5% definition instantiations). The facade class still
            // wraps it and is constructable (OpaqueFacadeClass uses setPrototypeOf).
            const privateClass = (_b = tryStructPrivate(classText, name, indent)) !== null && _b !== void 0 ? _b : syncFacadeSourceCtor(classText.replace(new RegExp(`^${indent}export\\s+class\\s+${n}\\b`), `${indent}class _${name}`), name);
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
        if (facade) {
            // Only rewrite Opaque-struct models into facades; leave Class-based models
            // as-is so a mixed file still converts the facade-able ones.
            return syncFacade(source, getFacadeableModelNames(source), true);
        }
        return syncCtor(syncFacade(source, modelNames, false), modelNames, mode);
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
    const tsconfigPath = staticFiles.length > 0
        ? (tsconfig !== null && tsconfig !== void 0 ? tsconfig : findNearestTsconfig(path.dirname(staticFiles[0])))
        : undefined;
    if (staticFiles.length > 0 && !tsconfigPath) {
        throw new Error("static model blocks require a tsconfig; pass --tsconfig <path>");
    }
    // Static/facade blocks resolve a model's generated `Encoded`/`Make`/services
    // from its NESTED models' generated namespaces. A composite model whose nested
    // models are generated in the same run only resolves correctly once those
    // namespaces exist, so we iterate until the static files reach a fixed point
    // (recreating the resolver each round to pick up freshly-written namespaces).
    const updatedSet = new Set();
    const MAX_ROUNDS = 5;
    let round = 0;
    let changedStatic = true;
    while (round === 0 || (changedStatic && round < MAX_ROUNDS)) {
        const firstRound = round === 0;
        round++;
        changedStatic = false;
        const resolver = tsconfigPath
            ? createModelTypeResolver({ tsconfigPath, files: staticFiles })
            : undefined;
        // First round: process every target (incl. non-static presets). Later rounds:
        // only re-resolve static files (the rest are already at a fixed point).
        const filesThisRound = firstRound ? targetFiles : staticFiles;
        for (const filePath of filesThisRound) {
            if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
                throw new Error(`File not found: ${filePath}`);
            }
            const source = fs.readFileSync(filePath, "utf8");
            if (!source.includes("// codegen:start"))
                continue;
            if (updateFile(filePath, source, defaults, resolver)) {
                updatedSet.add(path.relative(process.cwd(), filePath));
                if (staticFiles.includes(filePath))
                    changedStatic = true;
            }
            else if (firstRound && preSynced.has(filePath)) {
                updatedSet.add(path.relative(process.cwd(), filePath));
            }
        }
    }
    for (const f of updatedSet)
        updated.push(f);
    for (const f of targetFiles) {
        const rel = path.relative(process.cwd(), f);
        if (!updatedSet.has(rel) && fs.existsSync(f) && fs.readFileSync(f, "utf8").includes("// codegen:start")) {
            untouched.push(rel);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2xpLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL2NsaS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQ0EsT0FBTyxLQUFLLEVBQUUsTUFBTSxTQUFTLENBQUE7QUFDN0IsT0FBTyxLQUFLLElBQUksTUFBTSxXQUFXLENBQUE7QUFFakMsT0FBTyxJQUFJLE1BQU0sTUFBTSxDQUFBO0FBRXZCLE9BQU8sRUFBRSxhQUFhLEVBQUUsT0FBTyxFQUF3QixXQUFXLEVBQUUseUJBQXlCLEVBQUUsaUJBQWlCLEVBQUUsWUFBWSxFQUFFLG1CQUFtQixFQUFFLE1BQU0sMkJBQTJCLENBQUE7QUFDdEwsT0FBTyxFQUFFLHFCQUFxQixFQUFFLHVCQUF1QixFQUFFLE1BQU0sb0JBQW9CLENBQUE7QUFDbkYsT0FBTyxFQUFFLHVCQUF1QixFQUEwQixNQUFNLDJCQUEyQixDQUFBO0FBRTNGLE1BQU0sZ0JBQWdCLEdBQUcsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFBO0FBRWhELFNBQVMsVUFBVSxDQUFDLEdBQVcsRUFBRSxRQUFpQjtJQUNoRCxNQUFNLFVBQVUsR0FBRyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLEVBQUUsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsZ0JBQWdCLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFBO0lBQzVHLEtBQUssTUFBTSxTQUFTLElBQUksVUFBVSxFQUFFLENBQUM7UUFDbkMsSUFBSSxFQUFFLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQztZQUNoRSxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxZQUFZLENBQUMsU0FBUyxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUE7WUFDN0QsT0FBTyxNQUF5QixDQUFBO1FBQ2xDLENBQUM7SUFDSCxDQUFDO0lBQ0QsSUFBSSxRQUFRLEVBQUUsQ0FBQztRQUNiLE1BQU0sSUFBSSxLQUFLLENBQUMscUJBQXFCLFFBQVEsRUFBRSxDQUFDLENBQUE7SUFDbEQsQ0FBQztJQUNELE9BQU8sU0FBUyxDQUFBO0FBQ2xCLENBQUM7QUFFRCxNQUFNLFlBQVksR0FBRyxvREFBb0QsQ0FBQTtBQUN6RSxNQUFNLHNCQUFzQixHQUFHLGdHQUFnRyxDQUFBO0FBQy9ILE1BQU0sc0JBQXNCLEdBQUcsZ0dBQWdHLENBQUE7QUFDL0gsTUFBTSxrQkFBa0IsR0FBRywyRUFBMkUsQ0FBQTtBQUV0RyxTQUFTLFFBQVEsQ0FBQyxDQUFTO0lBQ3pCLE9BQU8sQ0FBQyxDQUFDLE9BQU8sQ0FBQyxxQkFBcUIsRUFBRSxNQUFNLENBQUMsQ0FBQTtBQUNqRCxDQUFDO0FBSUQ7Ozs7Ozs7O0dBUUc7QUFDSCxTQUFTLFFBQVEsQ0FBQyxNQUFjLEVBQUUsVUFBaUMsRUFBRSxJQUFjO0lBQ2pGLElBQUksR0FBRyxHQUFHLE1BQU0sQ0FBQTtJQUNoQixLQUFLLE1BQU0sSUFBSSxJQUFJLFVBQVUsRUFBRSxDQUFDO1FBQzlCLE1BQU0sQ0FBQyxHQUFHLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQTtRQUN4QixNQUFNLEVBQUUsR0FBRyxJQUFJLE1BQU0sQ0FDbkIsb0VBQW9FLENBQUMsd0JBQXdCLENBQUMseUJBQXlCLENBQUMsZ0JBQWdCLEVBQ3hJLEdBQUcsQ0FDSixDQUFBO1FBQ0QsTUFBTSxNQUFNLEdBQUcsSUFBSSxLQUFLLE1BQU07WUFDNUIsQ0FBQyxDQUFDLGlCQUFpQixJQUFJLFVBQVUsSUFBSSxhQUFhLElBQUksUUFBUTtZQUM5RCxDQUFDLENBQUMsSUFBSSxLQUFLLE1BQU07Z0JBQ2pCLENBQUMsQ0FBQyxnQkFBZ0IsSUFBSSxVQUFVLElBQUksV0FBVztnQkFDL0MsQ0FBQyxDQUFDLFlBQVksSUFBSSxLQUFLLElBQUksV0FBVyxDQUFBO1FBQ3hDLEdBQUcsR0FBRyxHQUFHLENBQUMsT0FBTyxDQUFDLEVBQUUsRUFBRSxNQUFNLENBQUMsQ0FBQTtJQUMvQixDQUFDO0lBQ0QsT0FBTyxHQUFHLENBQUE7QUFDWixDQUFDO0FBRUQsU0FBUyxpQkFBaUIsQ0FBQyxNQUFjLEVBQUUsU0FBaUI7SUFDMUQsSUFBSSxLQUFLLEdBQUcsQ0FBQyxDQUFBO0lBQ2IsSUFBSSxLQUFtQyxDQUFBO0lBQ3ZDLElBQUksT0FBTyxHQUFHLEtBQUssQ0FBQTtJQUNuQixJQUFJLFdBQVcsR0FBRyxLQUFLLENBQUE7SUFDdkIsSUFBSSxZQUFZLEdBQUcsS0FBSyxDQUFBO0lBRXhCLEtBQUssSUFBSSxLQUFLLEdBQUcsU0FBUyxFQUFFLEtBQUssR0FBRyxNQUFNLENBQUMsTUFBTSxFQUFFLEtBQUssRUFBRSxFQUFFLENBQUM7UUFDM0QsTUFBTSxJQUFJLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBRSxDQUFBO1FBQzNCLE1BQU0sSUFBSSxHQUFHLE1BQU0sQ0FBQyxLQUFLLEdBQUcsQ0FBQyxDQUFDLENBQUE7UUFFOUIsSUFBSSxXQUFXLEVBQUUsQ0FBQztZQUNoQixJQUFJLElBQUksS0FBSyxJQUFJO2dCQUFFLFdBQVcsR0FBRyxLQUFLLENBQUE7WUFDdEMsU0FBUTtRQUNWLENBQUM7UUFDRCxJQUFJLFlBQVksRUFBRSxDQUFDO1lBQ2pCLElBQUksSUFBSSxLQUFLLEdBQUcsSUFBSSxJQUFJLEtBQUssR0FBRyxFQUFFLENBQUM7Z0JBQ2pDLFlBQVksR0FBRyxLQUFLLENBQUE7Z0JBQ3BCLEtBQUssRUFBRSxDQUFBO1lBQ1QsQ0FBQztZQUNELFNBQVE7UUFDVixDQUFDO1FBQ0QsSUFBSSxLQUFLLEVBQUUsQ0FBQztZQUNWLElBQUksT0FBTyxFQUFFLENBQUM7Z0JBQ1osT0FBTyxHQUFHLEtBQUssQ0FBQTtZQUNqQixDQUFDO2lCQUFNLElBQUksSUFBSSxLQUFLLElBQUksRUFBRSxDQUFDO2dCQUN6QixPQUFPLEdBQUcsSUFBSSxDQUFBO1lBQ2hCLENBQUM7aUJBQU0sSUFBSSxJQUFJLEtBQUssS0FBSyxFQUFFLENBQUM7Z0JBQzFCLEtBQUssR0FBRyxTQUFTLENBQUE7WUFDbkIsQ0FBQztZQUNELFNBQVE7UUFDVixDQUFDO1FBRUQsSUFBSSxJQUFJLEtBQUssR0FBRyxJQUFJLElBQUksS0FBSyxHQUFHLEVBQUUsQ0FBQztZQUNqQyxXQUFXLEdBQUcsSUFBSSxDQUFBO1lBQ2xCLEtBQUssRUFBRSxDQUFBO1lBQ1AsU0FBUTtRQUNWLENBQUM7UUFDRCxJQUFJLElBQUksS0FBSyxHQUFHLElBQUksSUFBSSxLQUFLLEdBQUcsRUFBRSxDQUFDO1lBQ2pDLFlBQVksR0FBRyxJQUFJLENBQUE7WUFDbkIsS0FBSyxFQUFFLENBQUE7WUFDUCxTQUFRO1FBQ1YsQ0FBQztRQUNELElBQUksSUFBSSxLQUFLLElBQUksSUFBSSxJQUFJLEtBQUssR0FBRyxJQUFJLElBQUksS0FBSyxHQUFHLEVBQUUsQ0FBQztZQUNsRCxLQUFLLEdBQUcsSUFBSSxDQUFBO1lBQ1osU0FBUTtRQUNWLENBQUM7UUFDRCxJQUFJLElBQUksS0FBSyxHQUFHLEVBQUUsQ0FBQztZQUNqQixLQUFLLEVBQUUsQ0FBQTtZQUNQLFNBQVE7UUFDVixDQUFDO1FBQ0QsSUFBSSxJQUFJLEtBQUssR0FBRyxFQUFFLENBQUM7WUFDakIsS0FBSyxFQUFFLENBQUE7WUFDUCxJQUFJLEtBQUssS0FBSyxDQUFDO2dCQUFFLE9BQU8sS0FBSyxDQUFBO1FBQy9CLENBQUM7SUFDSCxDQUFDO0lBRUQsT0FBTyxDQUFDLENBQUMsQ0FBQTtBQUNYLENBQUM7QUFFRCxTQUFTLGlCQUFpQixDQUFDLE1BQWMsRUFBRSxLQUFhO0lBQ3RELElBQUksVUFBVSxHQUFHLENBQUMsQ0FBQTtJQUNsQixJQUFJLFlBQVksR0FBRyxDQUFDLENBQUE7SUFDcEIsSUFBSSxLQUFtQyxDQUFBO0lBQ3ZDLElBQUksT0FBTyxHQUFHLEtBQUssQ0FBQTtJQUNuQixJQUFJLFdBQVcsR0FBRyxLQUFLLENBQUE7SUFDdkIsSUFBSSxZQUFZLEdBQUcsS0FBSyxDQUFBO0lBRXhCLEtBQUssSUFBSSxLQUFLLEdBQUcsS0FBSyxFQUFFLEtBQUssR0FBRyxNQUFNLENBQUMsTUFBTSxFQUFFLEtBQUssRUFBRSxFQUFFLENBQUM7UUFDdkQsTUFBTSxJQUFJLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBRSxDQUFBO1FBQzNCLE1BQU0sSUFBSSxHQUFHLE1BQU0sQ0FBQyxLQUFLLEdBQUcsQ0FBQyxDQUFDLENBQUE7UUFFOUIsSUFBSSxXQUFXLEVBQUUsQ0FBQztZQUNoQixJQUFJLElBQUksS0FBSyxJQUFJO2dCQUFFLFdBQVcsR0FBRyxLQUFLLENBQUE7WUFDdEMsU0FBUTtRQUNWLENBQUM7UUFDRCxJQUFJLFlBQVksRUFBRSxDQUFDO1lBQ2pCLElBQUksSUFBSSxLQUFLLEdBQUcsSUFBSSxJQUFJLEtBQUssR0FBRyxFQUFFLENBQUM7Z0JBQ2pDLFlBQVksR0FBRyxLQUFLLENBQUE7Z0JBQ3BCLEtBQUssRUFBRSxDQUFBO1lBQ1QsQ0FBQztZQUNELFNBQVE7UUFDVixDQUFDO1FBQ0QsSUFBSSxLQUFLLEVBQUUsQ0FBQztZQUNWLElBQUksT0FBTyxFQUFFLENBQUM7Z0JBQ1osT0FBTyxHQUFHLEtBQUssQ0FBQTtZQUNqQixDQUFDO2lCQUFNLElBQUksSUFBSSxLQUFLLElBQUksRUFBRSxDQUFDO2dCQUN6QixPQUFPLEdBQUcsSUFBSSxDQUFBO1lBQ2hCLENBQUM7aUJBQU0sSUFBSSxJQUFJLEtBQUssS0FBSyxFQUFFLENBQUM7Z0JBQzFCLEtBQUssR0FBRyxTQUFTLENBQUE7WUFDbkIsQ0FBQztZQUNELFNBQVE7UUFDVixDQUFDO1FBRUQsSUFBSSxJQUFJLEtBQUssR0FBRyxJQUFJLElBQUksS0FBSyxHQUFHLEVBQUUsQ0FBQztZQUNqQyxXQUFXLEdBQUcsSUFBSSxDQUFBO1lBQ2xCLEtBQUssRUFBRSxDQUFBO1lBQ1AsU0FBUTtRQUNWLENBQUM7UUFDRCxJQUFJLElBQUksS0FBSyxHQUFHLElBQUksSUFBSSxLQUFLLEdBQUcsRUFBRSxDQUFDO1lBQ2pDLFlBQVksR0FBRyxJQUFJLENBQUE7WUFDbkIsS0FBSyxFQUFFLENBQUE7WUFDUCxTQUFRO1FBQ1YsQ0FBQztRQUNELElBQUksSUFBSSxLQUFLLElBQUksSUFBSSxJQUFJLEtBQUssR0FBRyxJQUFJLElBQUksS0FBSyxHQUFHLEVBQUUsQ0FBQztZQUNsRCxLQUFLLEdBQUcsSUFBSSxDQUFBO1lBQ1osU0FBUTtRQUNWLENBQUM7UUFDRCxJQUFJLElBQUksS0FBSyxHQUFHLEVBQUUsQ0FBQztZQUNqQixVQUFVLEVBQUUsQ0FBQTtZQUNaLFNBQVE7UUFDVixDQUFDO1FBQ0QsSUFBSSxJQUFJLEtBQUssR0FBRyxFQUFFLENBQUM7WUFDakIsVUFBVSxFQUFFLENBQUE7WUFDWixTQUFRO1FBQ1YsQ0FBQztRQUNELElBQUksSUFBSSxLQUFLLEdBQUcsRUFBRSxDQUFDO1lBQ2pCLFlBQVksRUFBRSxDQUFBO1lBQ2QsU0FBUTtRQUNWLENBQUM7UUFDRCxJQUFJLElBQUksS0FBSyxHQUFHLEVBQUUsQ0FBQztZQUNqQixZQUFZLEVBQUUsQ0FBQTtZQUNkLFNBQVE7UUFDVixDQUFDO1FBQ0QsSUFBSSxJQUFJLEtBQUssR0FBRyxJQUFJLFVBQVUsS0FBSyxDQUFDLElBQUksWUFBWSxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQzNELE9BQU8sS0FBSyxDQUFBO1FBQ2QsQ0FBQztJQUNILENBQUM7SUFFRCxPQUFPLENBQUMsQ0FBQyxDQUFBO0FBQ1gsQ0FBQztBQUVELFNBQVMsWUFBWSxDQUFDLE1BQWMsRUFBRSxLQUFhO0lBQ2pELE1BQU0sU0FBUyxHQUFHLGlCQUFpQixDQUFDLE1BQU0sRUFBRSxLQUFLLENBQUMsQ0FBQTtJQUNsRCxJQUFJLFNBQVMsS0FBSyxDQUFDLENBQUM7UUFBRSxPQUFPLENBQUMsQ0FBQyxDQUFBO0lBQy9CLE1BQU0sVUFBVSxHQUFHLGlCQUFpQixDQUFDLE1BQU0sRUFBRSxTQUFTLENBQUMsQ0FBQTtJQUN2RCxPQUFPLFVBQVUsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFVBQVUsR0FBRyxDQUFDLENBQUE7QUFDaEQsQ0FBQztBQUVELFNBQVMsaUJBQWlCLENBQUMsU0FBaUI7O0lBQzFDLE1BQU0sS0FBSyxHQUFHLDRFQUE0RSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQTtJQUMxRyxhQUFPLEtBQUssYUFBTCxLQUFLLHVCQUFMLEtBQUssQ0FBRyxDQUFDLENBQUMsbUNBQUksSUFBSSxDQUFBO0FBQzNCLENBQUM7QUFFRCxTQUFTLFVBQVUsQ0FBQyxNQUFjO0lBQ2hDLE9BQU8sTUFBTSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFBO0FBQzVELENBQUM7QUFFRCxTQUFTLFlBQVksQ0FBQyxNQUFjO0lBQ2xDLE1BQU0sSUFBSSxHQUFHLFVBQVUsQ0FBQyxNQUFNLENBQUMsQ0FBQTtJQUMvQixPQUFPLElBQUksQ0FBQyxNQUFNLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLGFBQWEsSUFBSSxFQUFFLENBQUE7QUFDakUsQ0FBQztBQUVELFNBQVMsb0JBQW9CLENBQUMsU0FBaUIsRUFBRSxJQUFZO0lBQzNELE1BQU0sQ0FBQyxHQUFHLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQTtJQUN4QixNQUFNLEVBQUUsR0FBRyxJQUFJLE1BQU0sQ0FDbkIsdUVBQXVFLENBQUMsS0FBSyxDQUFDLCtCQUErQixDQUFDLEtBQUssQ0FBQyw2QkFBNkIsQ0FBQyxLQUFLLENBQUMsbUJBQW1CLEVBQzNLLEdBQUcsQ0FDSixDQUFBO0lBQ0QsTUFBTSxTQUFTLEdBQUcsU0FBUyxDQUFDLE9BQU8sQ0FBQyxFQUFFLEVBQUUsYUFBYSxJQUFJLEdBQUcsQ0FBQyxDQUFBO0lBQzdELDhFQUE4RTtJQUM5RSxnRkFBZ0Y7SUFDaEYsbUZBQW1GO0lBQ25GLG1GQUFtRjtJQUNuRixpRkFBaUY7SUFDakYsMkVBQTJFO0lBQzNFLCtFQUErRTtJQUMvRSxNQUFNLFlBQVksR0FBRyxJQUFJLE1BQU0sQ0FDN0IsTUFBTSxDQUFDLG1FQUFtRSxFQUMxRSxHQUFHLENBQ0osQ0FBQTtJQUNELE9BQU8sU0FBUyxDQUFDLE9BQU8sQ0FBQyxZQUFZLEVBQUUsSUFBSSxJQUFJLEdBQUcsQ0FBQyxDQUFBO0FBQ3JELENBQUM7QUFFRCxTQUFTLGVBQWUsQ0FBQyxJQUFZLEVBQUUsTUFBYztJQUNuRCxPQUFPLGdCQUFnQixJQUFJLFlBQVksTUFBTSxxQkFBcUIsSUFBSSxLQUFLLElBQUksYUFBYSxJQUFJLFVBQVUsSUFBSSxzQkFBc0IsSUFBSSx5QkFBeUIsSUFBSSxNQUFNLENBQUE7QUFDN0ssQ0FBQztBQUVELGdHQUFnRztBQUNoRywrRUFBK0U7QUFDL0UsK0VBQStFO0FBQy9FLHFFQUFxRTtBQUNyRSxTQUFTLGdCQUFnQixDQUFDLFNBQWlCLEVBQUUsSUFBWSxFQUFFLE1BQWM7SUFDdkUsTUFBTSxJQUFJLEdBQUcsaUJBQWlCLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQyxDQUFBO0lBQzVDLElBQUksSUFBSSxLQUFLLENBQUMsQ0FBQztRQUFFLE9BQU8sSUFBSSxDQUFBO0lBQzVCLE1BQU0sS0FBSyxHQUFHLGlCQUFpQixDQUFDLFNBQVMsRUFBRSxJQUFJLENBQUMsQ0FBQTtJQUNoRCxJQUFJLEtBQUssS0FBSyxDQUFDLENBQUM7UUFBRSxPQUFPLElBQUksQ0FBQTtJQUM3QixNQUFNLElBQUksR0FBRyxTQUFTLENBQUMsS0FBSyxDQUFDLElBQUksR0FBRyxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUMsT0FBTyxDQUFDLGFBQWEsRUFBRSxFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsbUJBQW1CLEVBQUUsRUFBRSxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUE7SUFDaEgsSUFBSSxJQUFJLENBQUMsTUFBTSxHQUFHLENBQUM7UUFBRSxPQUFPLElBQUksQ0FBQSxDQUFDLDRDQUE0QztJQUM3RSx3RUFBd0U7SUFDeEUsTUFBTSxDQUFDLEdBQUcsb0VBQW9FLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUE7SUFDN0csSUFBSSxDQUFDLENBQUM7UUFBRSxPQUFPLElBQUksQ0FBQSxDQUFDLHNEQUFzRDtJQUMxRSxNQUFNLE9BQU8sR0FBRyxDQUFDLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFBLENBQUMsaUNBQWlDO0lBQzNFLElBQUksS0FBSyxHQUFHLENBQUMsQ0FBQTtJQUNiLElBQUksQ0FBQyxHQUFHLE9BQU8sQ0FBQTtJQUNmLE9BQU8sQ0FBQyxHQUFHLFNBQVMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztRQUNqQyxJQUFJLFNBQVMsQ0FBQyxDQUFDLENBQUMsS0FBSyxHQUFHO1lBQUUsS0FBSyxFQUFFLENBQUE7YUFDNUIsSUFBSSxTQUFTLENBQUMsQ0FBQyxDQUFDLEtBQUssR0FBRyxFQUFFLENBQUM7WUFDOUIsS0FBSyxFQUFFLENBQUE7WUFDUCxJQUFJLEtBQUssS0FBSyxDQUFDO2dCQUFFLE1BQUs7UUFDeEIsQ0FBQztJQUNILENBQUM7SUFDRCxNQUFNLE1BQU0sR0FBRyxTQUFTLENBQUMsS0FBSyxDQUFDLE9BQU8sR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUE7SUFDckQsT0FBTyxHQUFHLE1BQU0sVUFBVSxJQUFJLE1BQU0sTUFBTSxFQUFFLENBQUE7QUFDOUMsQ0FBQztBQUVELFNBQVMsVUFBVSxDQUFDLE1BQWMsRUFBRSxVQUFpQyxFQUFFLE9BQWdCOztJQUNyRixJQUFJLEdBQUcsR0FBRyxNQUFNLENBQUE7SUFDaEIsS0FBSyxNQUFNLElBQUksSUFBSSxVQUFVLEVBQUUsQ0FBQztRQUM5QixNQUFNLENBQUMsR0FBRyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUE7UUFDeEIsSUFBSSxPQUFPLEVBQUUsQ0FBQztZQUNaLDBGQUEwRjtZQUMxRixrR0FBa0c7WUFDbEcsOERBQThEO1lBQzlELE1BQU0sUUFBUSxHQUFHLElBQUksTUFBTSxDQUFDLHlCQUF5QixDQUFDLGdFQUFnRSxDQUFDLENBQUE7WUFDdkgsSUFBSSxRQUFRLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQztnQkFBRSxTQUFRO1lBQ2hDLE1BQU0sYUFBYSxHQUFHLElBQUksTUFBTSxDQUFDLGlDQUFpQyxDQUFDLHFFQUFxRSxDQUFDLENBQUE7WUFDekksTUFBTSxhQUFhLEdBQUcsSUFBSSxNQUFNLENBQUMsaUNBQWlDLENBQUMsWUFBWSxDQUFDLGdCQUFnQixDQUFDLENBQUE7WUFDakcsSUFBSSxhQUFhLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLGFBQWEsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztnQkFDdkQsR0FBRyxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQ2YsSUFBSSxNQUFNLENBQ1IsZ0NBQWdDLENBQUMseUJBQXlCLENBQUMsc0JBQXNCLENBQUMsdUJBQXVCLENBQUMsK0JBQStCLENBQUMsOEJBQThCLEVBQ3hLLEdBQUcsQ0FDSixFQUNELEtBQUssSUFBSSxPQUFPLElBQUksc0JBQXNCLElBQUkscUJBQXFCLENBQ3BFLENBQUE7Z0JBQ0QsTUFBTSxjQUFjLEdBQUcsSUFBSSxNQUFNLENBQUMsMEJBQTBCLENBQUMsS0FBSyxDQUFDLENBQUE7Z0JBQ25FLE1BQU0sWUFBWSxHQUFHLGNBQWMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUE7Z0JBQzdDLElBQUksWUFBWSxFQUFFLENBQUM7b0JBQ2pCLE1BQU0sS0FBSyxHQUFHLFlBQVksQ0FBQyxLQUFLLEdBQUcsWUFBWSxDQUFDLENBQUMsQ0FBRSxDQUFDLE1BQU0sQ0FBQTtvQkFDMUQsTUFBTSxHQUFHLEdBQUcsWUFBWSxDQUFDLEdBQUcsRUFBRSxLQUFLLENBQUMsQ0FBQTtvQkFDcEMsSUFBSSxHQUFHLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQzt3QkFDZixNQUFNLE9BQU8sR0FBRyxZQUFZLENBQUMsQ0FBQyxDQUFFLENBQUE7d0JBQ2hDLE1BQU0sRUFBRSxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsS0FBSyxFQUFFLEdBQUcsQ0FBQyxDQUFBO3dCQUNoQyxNQUFNLFdBQVcsU0FBRyxnQkFBZ0IsQ0FBQyxFQUFFLEVBQUUsSUFBSSxFQUFFLE9BQU8sQ0FBQyxtQ0FBSSxvQkFBb0IsQ0FBQyxFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUE7d0JBQ3pGLEdBQUcsR0FBRyxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLEtBQUssQ0FBQyxHQUFHLFdBQVcsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUE7b0JBQy9ELENBQUM7Z0JBQ0gsQ0FBQztnQkFDRCxNQUFNLFdBQVcsR0FBRyxJQUFJLE1BQU0sQ0FBQyxxRkFBcUYsQ0FBQyxxREFBcUQsQ0FBQyxLQUFLLENBQUMsQ0FBQTtnQkFDakwsSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztvQkFDM0IsTUFBTSxVQUFVLEdBQUcsSUFBSSxNQUFNLENBQzNCLHNDQUFzQyxDQUFDLFlBQVksQ0FBQyxvRUFBb0UsQ0FBQyxZQUFZLENBQUMsc0JBQXNCLENBQUMsc0JBQXNCLENBQUMsK0JBQStCLENBQUMsMkNBQTJDLENBQUMsVUFBVSxDQUMzUSxDQUFBO29CQUNELEdBQUcsR0FBRyxHQUFHLENBQUMsT0FBTyxDQUFDLFVBQVUsRUFBRSxDQUFDLE1BQU0sRUFBRSxTQUFpQixFQUFFLE1BQWMsRUFBRSxVQUFrQixFQUFFLEVBQUU7Ozt3QkFDOUYsTUFBTSxNQUFNLFNBQUcsTUFBQSx3Q0FBd0MsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLDBDQUFHLENBQUMsQ0FBQyxtQ0FBSSxFQUFFLENBQUE7d0JBQ25GLE9BQU87NEJBQ0wsR0FBRyxTQUFTLEdBQUcsTUFBTSxzREFBc0QsSUFBSSxHQUFHLFlBQVksQ0FBQyxNQUFNLENBQUMsR0FBRzs0QkFDekcsR0FBRyxNQUFNLEdBQUcsZUFBZSxDQUFDLElBQUksRUFBRSxNQUFNLENBQUMsRUFBRTs0QkFDM0MsR0FBRyxNQUFNLGdCQUFnQjt5QkFDMUIsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUE7b0JBQ2QsQ0FBQyxDQUFDLENBQUE7Z0JBQ0osQ0FBQztnQkFDRCxTQUFRO1lBQ1YsQ0FBQztZQUVELE1BQU0sT0FBTyxHQUFHLElBQUksTUFBTSxDQUFDLG1DQUFtQyxDQUFDLEtBQUssQ0FBQyxDQUFBO1lBQ3JFLE1BQU0sS0FBSyxHQUFHLE9BQU8sQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUE7WUFDL0IsSUFBSSxDQUFDLEtBQUs7Z0JBQUUsU0FBUTtZQUNwQixNQUFNLEtBQUssR0FBRyxLQUFLLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUUsQ0FBQyxNQUFNLENBQUE7WUFDNUMsTUFBTSxHQUFHLEdBQUcsWUFBWSxDQUFDLEdBQUcsRUFBRSxLQUFLLENBQUMsQ0FBQTtZQUNwQyxJQUFJLEdBQUcsS0FBSyxDQUFDLENBQUM7Z0JBQUUsU0FBUTtZQUV4QixNQUFNLFNBQVMsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLEtBQUssRUFBRSxHQUFHLENBQUMsQ0FBQTtZQUN2QyxNQUFNLE1BQU0sR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFFLENBQUE7WUFDeEIsTUFBTSxNQUFNLEdBQUcsaUJBQWlCLENBQUMsU0FBUyxDQUFDLENBQUE7WUFDM0MsOEVBQThFO1lBQzlFLDRFQUE0RTtZQUM1RSx5RUFBeUU7WUFDekUsTUFBTSxZQUFZLFNBQUcsZ0JBQWdCLENBQUMsU0FBUyxFQUFFLElBQUksRUFBRSxNQUFNLENBQUMsbUNBQUksb0JBQW9CLENBQ3BGLFNBQVMsQ0FBQyxPQUFPLENBQUMsSUFBSSxNQUFNLENBQUMsSUFBSSxNQUFNLHNCQUFzQixDQUFDLEtBQUssQ0FBQyxFQUFFLEdBQUcsTUFBTSxVQUFVLElBQUksRUFBRSxDQUFDLEVBQ2hHLElBQUksQ0FDTCxDQUFBO1lBQ0QsTUFBTSxNQUFNLEdBQUc7Z0JBQ2IsR0FBRyxNQUFNLHNEQUFzRCxJQUFJLEdBQUcsWUFBWSxDQUFDLE1BQU0sQ0FBQyxHQUFHO2dCQUM3RixHQUFHLE1BQU0sR0FBRyxlQUFlLENBQUMsSUFBSSxFQUFFLE1BQU0sQ0FBQyxFQUFFO2dCQUMzQyxHQUFHLE1BQU0sZ0JBQWdCO2FBQzFCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFBO1lBQ1osR0FBRyxHQUFHLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsS0FBSyxDQUFDLEdBQUcsWUFBWSxLQUFLLE1BQU0sR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUE7UUFDM0UsQ0FBQzthQUFNLENBQUM7WUFDTixNQUFNLE9BQU8sR0FBRyxJQUFJLE1BQU0sQ0FBQywwQkFBMEIsQ0FBQyxLQUFLLENBQUMsQ0FBQTtZQUM1RCxNQUFNLEtBQUssR0FBRyxPQUFPLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFBO1lBQy9CLElBQUksQ0FBQyxLQUFLO2dCQUFFLFNBQVE7WUFDcEIsTUFBTSxLQUFLLEdBQUcsS0FBSyxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFFLENBQUMsTUFBTSxDQUFBO1lBQzVDLE1BQU0sR0FBRyxHQUFHLFlBQVksQ0FBQyxHQUFHLEVBQUUsS0FBSyxDQUFDLENBQUE7WUFDcEMsSUFBSSxHQUFHLEtBQUssQ0FBQyxDQUFDO2dCQUFFLFNBQVE7WUFFeEIsTUFBTSxTQUFTLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxLQUFLLEVBQUUsR0FBRyxDQUFDLENBQUE7WUFDdkMsTUFBTSxNQUFNLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBRSxDQUFBO1lBQ3hCLE1BQU0sYUFBYSxHQUFHLFNBQVMsQ0FBQyxPQUFPLENBQUMsSUFBSSxNQUFNLENBQUMsSUFBSSxNQUFNLGFBQWEsQ0FBQyxLQUFLLENBQUMsRUFBRSxHQUFHLE1BQU0sZ0JBQWdCLElBQUksRUFBRSxDQUFDLENBQUE7WUFDbkgsTUFBTSxRQUFRLEdBQUcsSUFBSSxNQUFNLENBQUMsTUFBTSxNQUFNLDhFQUE4RSxNQUFNLHlCQUF5QixDQUFDLFlBQVksQ0FBQywrREFBK0QsQ0FBQyx3QkFBd0IsQ0FBQyxzQkFBc0IsQ0FBQyxzQkFBc0IsQ0FBQywrQkFBK0IsQ0FBQywyQ0FBMkMsQ0FBQyxvQkFBb0IsQ0FBQyxzRUFBc0UsQ0FBQyxZQUFZLENBQUMsc0JBQXNCLENBQUMsbUJBQW1CLENBQUMsK0JBQStCLENBQUMseUNBQXlDLENBQUMsMkJBQTJCLE1BQU0sa0JBQWtCLENBQUMsQ0FBQTtZQUN4b0IsR0FBRyxHQUFHLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsS0FBSyxDQUFDLEdBQUcsYUFBYSxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsUUFBUSxFQUFFLEVBQUUsQ0FBQyxDQUFBO1FBQ3ZGLENBQUM7SUFDSCxDQUFDO0lBQ0QsT0FBTyxHQUFHLENBQUE7QUFDWixDQUFDO0FBRUQsU0FBUyxlQUFlLENBQUMsTUFBYztJQUNyQywwRkFBMEY7SUFDMUYsNkZBQTZGO0lBQzdGLDhGQUE4RjtJQUM5RixJQUFJLFlBQVksQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQztRQUM5QixNQUFNLE1BQU0sR0FBRyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUE7UUFDOUMsTUFBTSxJQUFJLEdBQWEsc0JBQXNCLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQztZQUN4RCxDQUFDLENBQUMsTUFBTTtZQUNSLENBQUMsQ0FBQyxzQkFBc0IsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDO2dCQUNyQyxDQUFDLENBQUMsTUFBTTtnQkFDUixDQUFDLENBQUMsT0FBTyxDQUFBO1FBQ1gsTUFBTSxVQUFVLEdBQUcscUJBQXFCLENBQUMsTUFBTSxDQUFDLENBQUE7UUFDaEQsSUFBSSxNQUFNLEVBQUUsQ0FBQztZQUNYLDJFQUEyRTtZQUMzRSw2REFBNkQ7WUFDN0QsT0FBTyxVQUFVLENBQUMsTUFBTSxFQUFFLHVCQUF1QixDQUFDLE1BQU0sQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFBO1FBQ2xFLENBQUM7UUFDRCxPQUFPLFFBQVEsQ0FBQyxVQUFVLENBQUMsTUFBTSxFQUFFLFVBQVUsRUFBRSxLQUFLLENBQUMsRUFBRSxVQUFVLEVBQUUsSUFBSSxDQUFDLENBQUE7SUFDMUUsQ0FBQztJQUNELE9BQU8sTUFBTSxDQUFBO0FBQ2YsQ0FBQztBQUVELFNBQVMsVUFBVSxDQUFDLFFBQWdCLEVBQUUsTUFBYyxFQUFFLFFBQTBCLEVBQUUsUUFBNEI7SUFDNUcsSUFBSSxPQUFPLEdBQUcsS0FBSyxDQUFBO0lBRW5CLE1BQU0sTUFBTSxHQUFHLGVBQWUsQ0FBQyxNQUFNLENBQUMsQ0FBQTtJQUN0QyxJQUFJLE1BQU0sS0FBSyxNQUFNLEVBQUUsQ0FBQztRQUN0QixPQUFPLEdBQUcsSUFBSSxDQUFBO1FBQ2QsTUFBTSxHQUFHLE1BQU0sQ0FBQTtJQUNqQixDQUFDO0lBRUQsTUFBTSxJQUFJLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FDekIsT0FBTyxFQUNQLENBQUMsTUFBTSxFQUFFLE1BQWMsRUFBRSxVQUFrQixFQUFFLElBQVksRUFBRSxTQUFpQixFQUFFLEVBQUU7UUFDOUUsTUFBTSxPQUFPLEdBQUcsYUFBYSxDQUFDLGlCQUFpQixDQUFDLFVBQVUsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxDQUFBO1FBQ3RFLE1BQU0sZUFBZSxHQUFHLG1CQUFtQixDQUFDLElBQUksQ0FBQyxDQUFBO1FBQ2pELE1BQU0sZ0JBQWdCLEdBQUcsbUJBQW1CLENBQzFDLHlCQUF5QixDQUN2QixPQUFPLEVBQ1AsUUFBUSxFQUNSLFlBQVksQ0FBQyxPQUFPLEVBQUUsRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLGVBQWUsRUFBRSxFQUFFLE1BQU0sRUFBRSxRQUFRLENBQUMsQ0FDakYsQ0FDRixDQUFBO1FBRUQsTUFBTSxRQUFRLEdBQUcsZ0JBQWdCLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxXQUFXLENBQUMsZ0JBQWdCLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFBO1FBQ2hHLE1BQU0sV0FBVyxHQUFHLEdBQUcsTUFBTSxvQkFBb0IsVUFBVSxLQUFLLFFBQVEsR0FBRyxTQUFTLGdCQUFnQixDQUFBO1FBRXBHLElBQUksV0FBVyxLQUFLLE1BQU0sRUFBRSxDQUFDO1lBQzNCLE9BQU8sR0FBRyxJQUFJLENBQUE7UUFDaEIsQ0FBQztRQUVELE9BQU8sV0FBVyxDQUFBO0lBQ3BCLENBQUMsQ0FDRixDQUFBO0lBRUQsSUFBSSxJQUFJLEtBQUssTUFBTSxFQUFFLENBQUM7UUFDcEIsRUFBRSxDQUFDLGFBQWEsQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLENBQUE7SUFDbEMsQ0FBQztJQUVELE9BQU8sT0FBTyxDQUFBO0FBQ2hCLENBQUM7QUFTRCxTQUFTLFNBQVMsQ0FBQyxJQUEyQjtJQUM1QyxNQUFNLEtBQUssR0FBa0IsRUFBRSxDQUFBO0lBQy9CLElBQUksTUFBMEIsQ0FBQTtJQUM5QixJQUFJLFFBQTRCLENBQUE7SUFFaEMsS0FBSyxJQUFJLEtBQUssR0FBRyxDQUFDLEVBQUUsS0FBSyxHQUFHLElBQUksQ0FBQyxNQUFNLEVBQUUsS0FBSyxFQUFFLEVBQUUsQ0FBQztRQUNqRCxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFFLENBQUE7UUFDekIsSUFBSSxJQUFJLEtBQUssUUFBUSxJQUFJLElBQUksS0FBSyxJQUFJLEVBQUUsQ0FBQztZQUN2QyxPQUFPLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsQ0FBQTtRQUM5QixDQUFDO1FBQ0QsSUFBSSxJQUFJLEtBQUssUUFBUSxFQUFFLENBQUM7WUFDdEIsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLEtBQUssR0FBRyxDQUFDLENBQUMsQ0FBQTtZQUM1QixJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBQ1YsTUFBTSxJQUFJLEtBQUssQ0FBQywwQkFBMEIsQ0FBQyxDQUFBO1lBQzdDLENBQUM7WUFDRCxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLEdBQUcsRUFBRSxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUE7WUFDN0MsS0FBSyxFQUFFLENBQUE7WUFDUCxTQUFRO1FBQ1YsQ0FBQztRQUNELElBQUksSUFBSSxLQUFLLFVBQVUsRUFBRSxDQUFDO1lBQ3hCLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxLQUFLLEdBQUcsQ0FBQyxDQUFDLENBQUE7WUFDNUIsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO2dCQUNWLE1BQU0sSUFBSSxLQUFLLENBQUMsNEJBQTRCLENBQUMsQ0FBQTtZQUMvQyxDQUFDO1lBQ0QsTUFBTSxHQUFHLElBQUksQ0FBQTtZQUNiLEtBQUssRUFBRSxDQUFBO1lBQ1AsU0FBUTtRQUNWLENBQUM7UUFDRCxJQUFJLElBQUksS0FBSyxZQUFZLEVBQUUsQ0FBQztZQUMxQixNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFBO1lBQzVCLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDVixNQUFNLElBQUksS0FBSyxDQUFDLDhCQUE4QixDQUFDLENBQUE7WUFDakQsQ0FBQztZQUNELFFBQVEsR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxHQUFHLEVBQUUsRUFBRSxJQUFJLENBQUMsQ0FBQTtZQUM1QyxLQUFLLEVBQUUsQ0FBQTtZQUNQLFNBQVE7UUFDVixDQUFDO1FBQ0QsTUFBTSxJQUFJLEtBQUssQ0FBQyxxQkFBcUIsSUFBSSxFQUFFLENBQUMsQ0FBQTtJQUM5QyxDQUFDO0lBRUQsTUFBTSxNQUFNLEdBQWUsRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxDQUFBO0lBQ2pELElBQUksTUFBTSxLQUFLLFNBQVM7UUFBRSxNQUFNLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQTtJQUNoRCxJQUFJLFFBQVEsS0FBSyxTQUFTO1FBQUUsTUFBTSxDQUFDLFFBQVEsR0FBRyxRQUFRLENBQUE7SUFDdEQsT0FBTyxNQUFNLENBQUE7QUFDZixDQUFDO0FBRUQsbUZBQW1GO0FBQ25GLHVCQUF1QjtBQUN2QixNQUFNLGtCQUFrQixHQUFHLHNGQUFzRixDQUFBO0FBRWpILFNBQVMsWUFBWTtJQUNuQixPQUFPLElBQUk7U0FDUixJQUFJLENBQUMsdUJBQXVCLEVBQUU7UUFDN0IsR0FBRyxFQUFFLE9BQU8sQ0FBQyxHQUFHLEVBQUU7UUFDbEIsS0FBSyxFQUFFLElBQUk7UUFDWCxNQUFNLEVBQUU7WUFDTixvQkFBb0I7WUFDcEIsWUFBWTtZQUNaLGFBQWE7WUFDYixZQUFZO1NBQ2I7S0FDRixDQUFDO1NBQ0QsR0FBRyxDQUFDLENBQUMsUUFBUSxFQUFFLEVBQUUsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxHQUFHLEVBQUUsRUFBRSxRQUFRLENBQUMsQ0FBQyxDQUFBO0FBQzdELENBQUM7QUFFRCxTQUFTLG1CQUFtQixDQUFDLE9BQWU7SUFDMUMsSUFBSSxHQUFHLEdBQUcsT0FBTyxDQUFBO0lBQ2pCLFNBQVMsQ0FBQztRQUNSLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLGVBQWUsQ0FBQyxDQUFBO1FBQ2pELElBQUksRUFBRSxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUM7WUFBRSxPQUFPLFNBQVMsQ0FBQTtRQUM5QyxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFBO1FBQ2hDLElBQUksTUFBTSxLQUFLLEdBQUc7WUFBRSxPQUFPLFNBQVMsQ0FBQTtRQUNwQyxHQUFHLEdBQUcsTUFBTSxDQUFBO0lBQ2QsQ0FBQztBQUNILENBQUM7QUFFRCxTQUFTLEdBQUc7SUFDVixNQUFNLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsUUFBUSxFQUFFLEdBQUcsU0FBUyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUE7SUFFMUUsSUFBSSxJQUFJLEVBQUUsQ0FBQztRQUNULE9BQU8sQ0FBQyxHQUFHLENBQUMsb0ZBQW9GLENBQUMsQ0FBQTtRQUNqRyxPQUFPLENBQUMsR0FBRyxDQUFDLHlGQUF5RixDQUFDLENBQUE7UUFDdEcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxTQUFTLGdCQUFnQixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsNkNBQTZDLENBQUMsQ0FBQTtRQUM5RixPQUFPLENBQUMsR0FBRyxDQUFDLHNGQUFzRixDQUFDLENBQUE7UUFDbkcsT0FBTTtJQUNSLENBQUM7SUFFRCxNQUFNLFFBQVEsR0FBRyxVQUFVLENBQUMsT0FBTyxDQUFDLEdBQUcsRUFBRSxFQUFFLE1BQU0sQ0FBQyxDQUFBO0lBQ2xELE1BQU0sV0FBVyxHQUFHLEtBQUssQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLFlBQVksRUFBRSxDQUFBO0lBQzdELE1BQU0sT0FBTyxHQUFrQixFQUFFLENBQUE7SUFDakMsTUFBTSxTQUFTLEdBQWtCLEVBQUUsQ0FBQTtJQUVuQyx5RkFBeUY7SUFDekYsTUFBTSxjQUFjLEdBQUcsV0FBVyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUE7SUFDN0YsTUFBTSxXQUFXLEdBQUcsY0FBYyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsa0JBQWtCLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxZQUFZLENBQUMsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQTtJQUNyRyxNQUFNLFNBQVMsR0FBRyxJQUFJLEdBQUcsRUFBVSxDQUFBO0lBQ25DLEtBQUssTUFBTSxRQUFRLElBQUksV0FBVyxFQUFFLENBQUM7UUFDbkMsTUFBTSxNQUFNLEdBQUcsRUFBRSxDQUFDLFlBQVksQ0FBQyxRQUFRLEVBQUUsTUFBTSxDQUFDLENBQUE7UUFDaEQsTUFBTSxNQUFNLEdBQUcsZUFBZSxDQUFDLE1BQU0sQ0FBQyxDQUFBO1FBQ3RDLElBQUksTUFBTSxLQUFLLE1BQU0sRUFBRSxDQUFDO1lBQ3RCLEVBQUUsQ0FBQyxhQUFhLENBQUMsUUFBUSxFQUFFLE1BQU0sQ0FBQyxDQUFBO1lBQ2xDLFNBQVMsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLENBQUE7UUFDekIsQ0FBQztJQUNILENBQUM7SUFDRCxNQUFNLFlBQVksR0FBRyxXQUFXLENBQUMsTUFBTSxHQUFHLENBQUM7UUFDekMsQ0FBQyxDQUFDLENBQUMsUUFBUSxhQUFSLFFBQVEsY0FBUixRQUFRLEdBQUksbUJBQW1CLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2xFLENBQUMsQ0FBQyxTQUFTLENBQUE7SUFDYixJQUFJLFdBQVcsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7UUFDNUMsTUFBTSxJQUFJLEtBQUssQ0FBQyxnRUFBZ0UsQ0FBQyxDQUFBO0lBQ25GLENBQUM7SUFFRCw2RUFBNkU7SUFDN0UsK0VBQStFO0lBQy9FLDBFQUEwRTtJQUMxRSw2RUFBNkU7SUFDN0UsOEVBQThFO0lBQzlFLE1BQU0sVUFBVSxHQUFHLElBQUksR0FBRyxFQUFVLENBQUE7SUFDcEMsTUFBTSxVQUFVLEdBQUcsQ0FBQyxDQUFBO0lBQ3BCLElBQUksS0FBSyxHQUFHLENBQUMsQ0FBQTtJQUNiLElBQUksYUFBYSxHQUFHLElBQUksQ0FBQTtJQUN4QixPQUFPLEtBQUssS0FBSyxDQUFDLElBQUksQ0FBQyxhQUFhLElBQUksS0FBSyxHQUFHLFVBQVUsQ0FBQyxFQUFFLENBQUM7UUFDNUQsTUFBTSxVQUFVLEdBQUcsS0FBSyxLQUFLLENBQUMsQ0FBQTtRQUM5QixLQUFLLEVBQUUsQ0FBQTtRQUNQLGFBQWEsR0FBRyxLQUFLLENBQUE7UUFDckIsTUFBTSxRQUFRLEdBQWtDLFlBQVk7WUFDMUQsQ0FBQyxDQUFDLHVCQUF1QixDQUFDLEVBQUUsWUFBWSxFQUFFLEtBQUssRUFBRSxXQUFXLEVBQUUsQ0FBQztZQUMvRCxDQUFDLENBQUMsU0FBUyxDQUFBO1FBRWIsOEVBQThFO1FBQzlFLHdFQUF3RTtRQUN4RSxNQUFNLGNBQWMsR0FBRyxVQUFVLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsV0FBVyxDQUFBO1FBQzdELEtBQUssTUFBTSxRQUFRLElBQUksY0FBYyxFQUFFLENBQUM7WUFDdEMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUM7Z0JBQ2hFLE1BQU0sSUFBSSxLQUFLLENBQUMsbUJBQW1CLFFBQVEsRUFBRSxDQUFDLENBQUE7WUFDaEQsQ0FBQztZQUNELE1BQU0sTUFBTSxHQUFHLEVBQUUsQ0FBQyxZQUFZLENBQUMsUUFBUSxFQUFFLE1BQU0sQ0FBQyxDQUFBO1lBQ2hELElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGtCQUFrQixDQUFDO2dCQUFFLFNBQVE7WUFDbEQsSUFBSSxVQUFVLENBQUMsUUFBUSxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUUsUUFBUSxDQUFDLEVBQUUsQ0FBQztnQkFDckQsVUFBVSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxHQUFHLEVBQUUsRUFBRSxRQUFRLENBQUMsQ0FBQyxDQUFBO2dCQUN0RCxJQUFJLFdBQVcsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDO29CQUFFLGFBQWEsR0FBRyxJQUFJLENBQUE7WUFDMUQsQ0FBQztpQkFBTSxJQUFJLFVBQVUsSUFBSSxTQUFTLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUM7Z0JBQ2pELFVBQVUsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsR0FBRyxFQUFFLEVBQUUsUUFBUSxDQUFDLENBQUMsQ0FBQTtZQUN4RCxDQUFDO1FBQ0gsQ0FBQztJQUNILENBQUM7SUFDRCxLQUFLLE1BQU0sQ0FBQyxJQUFJLFVBQVU7UUFBRSxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFBO0lBQzNDLEtBQUssTUFBTSxDQUFDLElBQUksV0FBVyxFQUFFLENBQUM7UUFDNUIsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUE7UUFDM0MsSUFBSSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUMsWUFBWSxDQUFDLENBQUMsRUFBRSxNQUFNLENBQUMsQ0FBQyxRQUFRLENBQUMsa0JBQWtCLENBQUMsRUFBRSxDQUFDO1lBQ3hHLFNBQVMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUE7UUFDckIsQ0FBQztJQUNILENBQUM7SUFFRCxPQUFPLENBQUMsR0FBRyxDQUFDLFlBQVksT0FBTyxDQUFDLE1BQU0sYUFBYSxTQUFTLENBQUMsTUFBTSxZQUFZLENBQUMsQ0FBQTtJQUNoRixLQUFLLE1BQU0sUUFBUSxJQUFJLE9BQU8sRUFBRSxDQUFDO1FBQy9CLE9BQU8sQ0FBQyxHQUFHLENBQUMsV0FBVyxRQUFRLEVBQUUsQ0FBQyxDQUFBO0lBQ3BDLENBQUM7QUFDSCxDQUFDO0FBRUQsSUFBSSxDQUFDO0lBQ0gsR0FBRyxFQUFFLENBQUE7QUFDUCxDQUFDO0FBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztJQUNmLE1BQU0sT0FBTyxHQUFHLEtBQUssWUFBWSxLQUFLLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQTtJQUN0RSxPQUFPLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFBO0lBQ3RCLE9BQU8sQ0FBQyxRQUFRLEdBQUcsQ0FBQyxDQUFBO0FBQ3RCLENBQUMifQ==