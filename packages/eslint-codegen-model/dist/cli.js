#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";
import { globSync } from "glob";
import { applyDefaults, blockRe, indentBlock, normaliseGeneratedContent, parseBlockOptions, renderPreset, trimTrailingNewline } from "./shared/codegen-block.js";
import { getExportedModelNames, getFacadeableModelNames } from "./presets/model.js";
import { createNativeModelTypeResolver } from "./shared/native-type-resolver.js";
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
                // Upgrade a 3-arg facade (`<X, X.Encoded, X.Make>`) to the 5-arg form by
                // appending the services. Idempotent: when the services are already
                // present (group 3), leave the match untouched so we don't collapse a
                // dprint-wrapped multi-line declaration back to one line (which would
                // oscillate with the formatter forever).
                out = out.replace(new RegExp(`(OpaqueFacade(?:Class)?<\\s*)${n}(?:\\.Type)?(\\s*,\\s*${n}\\.Encoded\\s*,\\s*${n}\\.Make)((?:\\s*,\\s*${n}\\.DecodingServices\\s*,\\s*${n}\\.EncodingServices)?)(\\s*>)`, "g"), (match, p1, p2, services, p3) => services ? match : `${p1}${name}${p2}, ${name}.DecodingServices, ${name}.EncodingServices${p3}`);
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
    // Native (tsgo) is the default resolver; `--legacy` opts back into the classic
    // `typescript` Compiler API. `--native` is kept as an accepted no-op.
    let native = true;
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
        if (part === "--native") {
            native = true;
            continue;
        }
        if (part === "--legacy" || part === "--classic") {
            native = false;
            continue;
        }
        throw new Error(`Unknown argument: ${part}`);
    }
    const result = { files, help: false, native };
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
    return globSync("**/*.{ts,tsx,mts,cts}", {
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
    const { config, files, help, native, tsconfig } = parseArgs(process.argv.slice(2));
    if (help) {
        console.log("Usage: effect-app-codegen [--file <path>]... [--config <path>] [--tsconfig <path>] [--legacy]");
        console.log("Runs codegen blocks in the given files, or scans the current working tree when omitted.");
        console.log(`Loads ${CONFIG_FILENAMES.join(", ")} from cwd when present; --config overrides.`);
        console.log("static/facade blocks resolve via the native tsgo fork by default; --legacy uses the classic typescript API.");
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
            ? native
                ? createNativeModelTypeResolver({ tsconfigPath })
                : createModelTypeResolver({ tsconfigPath, files: staticFiles })
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2xpLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL2NsaS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQ0EsT0FBTyxLQUFLLEVBQUUsTUFBTSxTQUFTLENBQUE7QUFDN0IsT0FBTyxLQUFLLElBQUksTUFBTSxXQUFXLENBQUE7QUFFakMsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLE1BQU0sQ0FBQTtBQUUvQixPQUFPLEVBQUUsYUFBYSxFQUFFLE9BQU8sRUFBd0IsV0FBVyxFQUFFLHlCQUF5QixFQUFFLGlCQUFpQixFQUFFLFlBQVksRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDJCQUEyQixDQUFBO0FBQ3RMLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSx1QkFBdUIsRUFBRSxNQUFNLG9CQUFvQixDQUFBO0FBQ25GLE9BQU8sRUFBRSw2QkFBNkIsRUFBRSxNQUFNLGtDQUFrQyxDQUFBO0FBQ2hGLE9BQU8sRUFBRSx1QkFBdUIsRUFBMEIsTUFBTSwyQkFBMkIsQ0FBQTtBQUUzRixNQUFNLGdCQUFnQixHQUFHLENBQUMscUJBQXFCLENBQUMsQ0FBQTtBQUVoRCxTQUFTLFVBQVUsQ0FBQyxHQUFXLEVBQUUsUUFBaUI7SUFDaEQsTUFBTSxVQUFVLEdBQUcsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxFQUFFLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQTtJQUM1RyxLQUFLLE1BQU0sU0FBUyxJQUFJLFVBQVUsRUFBRSxDQUFDO1FBQ25DLElBQUksRUFBRSxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUM7WUFDaEUs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