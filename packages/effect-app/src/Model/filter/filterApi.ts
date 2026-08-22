import { type RelationDirection } from "../query.ts"

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
  | "hasKey"
  | "notHasKey"
  | "hasValue"
  | "notHasValue"
  | "hasKeyValue"
  | "notHasKeyValue"
  | "hasKey-any"
  | "notHasKey-any"
  | "hasKey-all"
  | "notHasKey-all"
  | "hasValue-any"
  | "notHasValue-any"
  | "hasValue-all"
  | "notHasValue-all"
  | "hasKeyValue-any"
  | "notHasKeyValue-any"
  | "hasKeyValue-all"
  | "notHasKeyValue-all"
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
  relation: RelationDirection
} | {
  t: "and-scope"
  result: readonly FilterResult[]
  relation: RelationDirection
} | {
  t: "where-scope"
  result: readonly FilterResult[]
  relation: RelationDirection
}

export type FilterR = {
  op: Ops

  path: string
  value: unknown
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
