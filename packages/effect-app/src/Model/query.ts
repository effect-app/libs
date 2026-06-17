export * from "./query/dsl.ts"
export * from "./query/new-kid-interpreter.ts"

export interface RawQuery<Encoded, Out> {
  cosmos: (vals: { name: string }) => {
    query: string
    parameters: {
      name: string
      value: any
    }[]
  }
  memory: (t: readonly Encoded[]) => readonly Out[]
}
