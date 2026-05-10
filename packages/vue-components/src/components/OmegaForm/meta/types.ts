/* eslint-disable @typescript-eslint/no-explicit-any */
import type { DeepKeys } from "@tanstack/vue-form"
import type * as S from "effect-app/Schema"
import type { Redacted } from "effect/Redacted"

// Recursively replace Redacted<A> with its inner type so DeepKeys treats it as a leaf
type StripRedacted<T> = T extends Redacted<any> ? string
  : T extends ReadonlyArray<infer U> ? ReadonlyArray<StripRedacted<U>>
  : T extends Record<string, any> ? { [K in keyof T]: StripRedacted<T[K]> }
  : T

export type NestedKeyOf<T> = DeepKeys<StripRedacted<T>>

// Field metadata type definitions
export type BaseFieldMeta = {
  required: boolean
  nullableOrUndefined?: false | "undefined" | "null"
  /**
   * True when the schema property is `S.optionalKey` (AST
   * `context.isOptional`) — i.e. the key should be ABSENT from the submitted
   * object when empty, not present with `undefined`. Distinct from
   * `required: false`, which may also mean "empty string is valid" for
   * unconstrained `S.String` fields.
   */
  isOptionalKey?: boolean
}

export type StringFieldMeta = BaseFieldMeta & {
  type: "string"
  maxLength?: number
  minLength?: number
  format?: string
}

export type NumberFieldMeta = BaseFieldMeta & {
  type: "number"
  minimum?: number
  maximum?: number
  exclusiveMinimum?: number
  exclusiveMaximum?: number
  refinement?: "int"
}

export type SelectFieldMeta = BaseFieldMeta & {
  type: "select"
  members: any[] // TODO: should be non empty array?
}

export type MultipleFieldMeta = BaseFieldMeta & {
  type: "multiple"
  members: any[] // TODO: should be non empty array?
  rest: readonly S.AST.AST[]
}

export type BooleanFieldMeta = BaseFieldMeta & {
  type: "boolean"
}

export type DateFieldMeta = BaseFieldMeta & {
  type: "date"
}

export type UnknownFieldMeta = BaseFieldMeta & {
  type: "unknown"
}

export type FieldMeta =
  | StringFieldMeta
  | NumberFieldMeta
  | SelectFieldMeta
  | MultipleFieldMeta
  | BooleanFieldMeta
  | DateFieldMeta
  | UnknownFieldMeta

export type MetaRecord<T = string> = {
  [K in NestedKeyOf<T>]?: FieldMeta
}
