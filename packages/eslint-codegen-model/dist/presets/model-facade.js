// Whitespace-insensitive equality: the generated class line is long, so dprint wraps the
// `extends OpaqueFacadeClass<...>` type args across multiple lines. Comparing stripped of
// all whitespace lets a dprint-formatted block match the single-line form, so codegen leaves
// it alone instead of reverting it (which would just re-wrap → codegen/dprint oscillation).
const stripWs = (s) => s.replace(/\s+/g, "");
export function modelFacade({ meta, options }) {
    const className = options.className;
    if (typeof className !== "string" || className.length === 0) {
        return "/** modelFacade requires `className` */";
    }
    const name = typeof options.name === "string" && options.name.length > 0
        ? options.name
        : className.startsWith("_")
            ? className.slice(1)
            : className;
    const schema = typeof options.schema === "string" ? options.schema : "S";
    const prefix = schema.length > 0 ? `${schema}.` : "";
    const lhs = options.base === true ? `class __${name}` : `export class ${name}`;
    const decl = `${lhs} extends ${prefix}OpaqueFacadeClass<${name}, ${name}.Encoded, ${name}.Make, ${name}.DecodingServices, ${name}.EncodingServices>()(${className}) {}`;
    // The exported facade `class ${name}` merges with the generated `export interface ${name}`
    // (the top-level instance shape from the `model` facade preset) — that merge is intentional,
    // so suppress no-unsafe-declaration-merging. Base mode emits a private `class __${name}` that
    // doesn't merge (the user's own `export class ${name} extends __${name}` owns the disable).
    const expected = options.base === true
        ? decl
        : `// eslint-disable-next-line typescript/no-unsafe-declaration-merging\n${decl}`;
    // Preserve the dprint-formatted block when it's equivalent (see stripWs above).
    if (meta && stripWs(meta.existingContent) === stripWs(expected)) {
        return meta.existingContent;
    }
    return expected;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9kZWwtZmFjYWRlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL3ByZXNldHMvbW9kZWwtZmFjYWRlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQVlBLHlGQUF5RjtBQUN6RiwwRkFBMEY7QUFDMUYsNkZBQTZGO0FBQzdGLDRGQUE0RjtBQUM1RixNQUFNLE9BQU8sR0FBRyxDQUFDLENBQVMsRUFBVSxFQUFFLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDLENBQUE7QUFFNUQsTUFBTSxVQUFVLFdBQVcsQ0FDekIsRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUF1RTtJQUV0RixNQUFNLFNBQVMsR0FBRyxPQUFPLENBQUMsU0FBUyxDQUFBO0lBQ25DLElBQUksT0FBTyxTQUFTLEtBQUssUUFBUSxJQUFJLFNBQVMsQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7UUFDNUQsT0FBTyx5Q0FBeUMsQ0FBQTtJQUNsRCxDQUFDO0lBQ0QsTUFBTSxJQUFJLEdBQUcsT0FBTyxPQUFPLENBQUMsSUFBSSxLQUFLLFFBQVEsSUFBSSxPQUFPLENBQUMsSUFBSSxDQUFDLE1BQU0sR0FBRyxDQUFDO1FBQ3RFLENBQUMsQ0FBQyxPQUFPLENBQUMsSUFBSTtRQUNkLENBQUMsQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQztZQUMzQixDQUFDLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7WUFDcEIsQ0FBQyxDQUFDLFNBQVMsQ0FBQTtJQUNiLE1BQU0sTUFBTSxHQUFHLE9BQU8sT0FBTyxDQUFDLE1BQU0sS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQTtJQUN4RSxNQUFNLE1BQU0sR0FBRyxNQUFNLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFBO0lBQ3BELE1BQU0sR0FBRyxHQUFHLE9BQU8sQ0FBQyxJQUFJLEtBQUssSUFBSSxDQUFDLENBQUMsQ0FBQyxXQUFXLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQyxnQkFBZ0IsSUFBSSxFQUFFLENBQUE7SUFDOUUsTUFBTSxJQUFJLEdBQ1IsR0FBRyxHQUFHLFlBQVksTUFBTSxxQkFBcUIsSUFBSSxLQUFLLElBQUksYUFBYSxJQUFJLFVBQVUsSUFBSSxzQkFBc0IsSUFBSSx3QkFBd0IsU0FBUyxNQUFNLENBQUE7SUFDNUosMkZBQTJGO0lBQzNGLDZGQUE2RjtJQUM3Riw4RkFBOEY7SUFDOUYsNEZBQTRGO0lBQzVGLE1BQU0sUUFBUSxHQUFHLE9BQU8sQ0FBQyxJQUFJLEtBQUssSUFBSTtRQUNwQyxDQUFDLENBQUMsSUFBSTtRQUNOLENBQUMsQ0FBQyx5RUFBeUUsSUFBSSxFQUFFLENBQUE7SUFDbkYsZ0ZBQWdGO0lBQ2hGLElBQUksSUFBSSxJQUFJLE9BQU8sQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLEtBQUssT0FBTyxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUM7UUFDaEUsT0FBTyxJQUFJLENBQUMsZUFBZSxDQUFBO0lBQzdCLENBQUM7SUFDRCxPQUFPLFFBQVEsQ0FBQTtBQUNqQixDQUFDIn0=