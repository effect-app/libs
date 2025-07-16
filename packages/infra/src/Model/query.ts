export * from "./query/dsl.js"
export * from "./query/new-kid-interpreter.js"

export interface RawQuery<Encoded, Out> {
  cosmos: (vals: { importedMarkerId: string; name: string }) => {
    query: string
    parameters: {
      name: string
      value: any
    }[]
  }
  memory: (t: readonly Encoded[]) => readonly Out[]
}
