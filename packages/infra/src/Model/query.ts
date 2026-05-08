export * from "./query/dsl.js"
export * from "./query/new-kid-interpreter.js"

export interface CosmosRawQuery {
  query: string
  parameters: {
    name: string
    value: any
  }[]
}

export interface SqlRawQuery {
  query: string
  parameters?: readonly unknown[] | undefined
}

export interface RawQuery<Encoded, Out> {
  cosmos?: (vals: { name: string }) => CosmosRawQuery
  sqlite?: (vals: { name: string; tableName: string; namespace: string }) => SqlRawQuery
  pg?: (vals: { name: string; tableName: string; namespace: string }) => SqlRawQuery
  memory?: (t: readonly Encoded[]) => readonly Out[]
}
