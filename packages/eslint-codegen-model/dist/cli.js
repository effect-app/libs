#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";
import { globSync } from "glob";
import { getExportedModelNames, getFacadeableModelNames } from "./presets/model.js";
import { createNativeModelTypeResolver } from "./shared/native-type-resolver.js";
import { applyDefaults, blockRe, indentBlock, normaliseGeneratedContent, parseBlockOptions, renderPreset, trimTrailingNewline } from "./shared/codegen-block.js";
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
    return `export class ${name} extends ${prefix}OpaqueFacade<${name}, ${name}.Encoded, ${name}.Make, ${name}.DecodingServices, ${name}.EncodingServices>()(_${name}) {}`;
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
            // Base mode: the facade is the generated `class __X extends OpaqueFacade<...>()(_X)`
            // (owned by its modelFacade block); the user owns `export class X extends __X { ...statics... }`.
            // Leave both alone — only the block preset regenerates `__X`.
            const baseMode = new RegExp(`(^|\\n)\\s*class\\s+__${n}\\s+extends\\s+(?:[A-Za-z_$][\\w$]*\\.)?OpaqueFacade(?:Class)?\\s*<`);
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
                        ]
                            .join("\n");
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
            // wraps it and is constructable (OpaqueFacade uses overloads for class vs struct schemas).
            const privateClass = (_b = tryStructPrivate(classText, name, indent)) !== null && _b !== void 0 ? _b : syncFacadeSourceCtor(classText.replace(new RegExp(`^${indent}export\\s+class\\s+${n}\\b`), `${indent}class _${name}`), name);
            const facade = [
                `${indent}// codegen:start {preset: modelFacade, className: _${name}${schemaOption(prefix)}}`,
                `${indent}${facadeClassLine(name, prefix)}`,
                `${indent}// codegen:end`
            ]
                .join("\n");
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2xpLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL2NsaS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQ0EsT0FBTyxLQUFLLEVBQUUsTUFBTSxTQUFTLENBQUE7QUFDN0IsT0FBTyxLQUFLLElBQUksTUFBTSxXQUFXLENBQUE7QUFFakMsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLE1BQU0sQ0FBQTtBQUUvQixPQUFPLEVBQUUscUJBQXFCLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQTtBQUNuRixPQUFPLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQTtBQUNoRixPQUFPLEVBQUUsYUFBYSxFQUFFLE9BQU8sRUFBd0IsV0FBVyxFQUFFLHlCQUF5QixFQUFFLGlCQUFpQixFQUFFLFlBQVksRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDJCQUEyQixDQUFBO0FBQ3RMLE9BQU8sRUFBRSx1QkFBdUIsRUFBMEIsTUFBTSwyQkFBMkIsQ0FBQTtBQUUzRixNQUFNLGdCQUFnQixHQUFHLENBQUMscUJBQXFCLENBQUMsQ0FBQTtBQUVoRCxTQUFTLFVBQVUsQ0FBQyxHQUFXLEVBQUUsUUFBaUI7SUFDaEQsTUFBTSxVQUFVLEdBQUcsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxFQUFFLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQTtJQUM1RyxLQUFLLE1BQU0sU0FBUyxJQUFJLFVBQVUsRUFBRSxDQUFDO1FBQ25DLElBQUksRUFBRSxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUM7WUFDaEUs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