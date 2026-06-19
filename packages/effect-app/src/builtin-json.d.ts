// JSON / Body return-type overrides (`any` -> `unknown`), isolated from
// `builtin.ts` so consumers that source-link this package (e.g. an embedded
// Effect-source setup) can toggle them off. As a `declare global`, the override
// is program-wide: in linked mode it leaks into source-linked Effect and breaks
// Effect's own `JSON.parse(...)` / `response.json()` call sites (TS2322
// `unknown` vs `Json`). `builtin.ts` triple-slash-references this file, so
// normal builds keep the override.
declare global {
  interface JSON {
    /**
     * Converts a JavaScript Object Notation (JSON) string into an object.
     * @param text A valid JSON string.
     * @param reviver A function that transforms the results. This function is called for each member of the object.
     * If a member contains nested objects, the nested objects are transformed before the parent object is.
     */
    parse(text: string, reviver?: (this: any, key: string, value: any) => any): unknown
  }

  interface Body {
    json(): Promise<unknown>
  }
}

export {}
