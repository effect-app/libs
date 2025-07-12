export type InOps =
  | "in"
  | "notIn"

export type OtherOps =
  | "endsWith"
  | "startsWith"
  | "notEndsWith"
  | "notStartsWith"
  | "contains"
  | "notContains"
  | "includes"
  | "notIncludes"
  | "includes-any"
  | "notIncludes-any"
  | "includes-all"
  | "notIncludes-all"
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"

export type Ops = OtherOps | InOps

export type FilterScopes = {
  t: "or-scope"
  result: readonly FilterResult[]
} | {
  t: "and-scope"
  result: readonly FilterResult[]
} | {
  t: "where-scope"
  result: readonly FilterResult[]
}

export type FilterR = {
  op: Ops

  path: string
  value: string // ToDO: Value[]
}

export type FilterResult =
  | {
    t: "where"
  } & FilterR
  | {
    t: "or"
  } & FilterR
  | {
    t: "and"
  } & FilterR
  | FilterScopes
