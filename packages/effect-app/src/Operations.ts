import * as S from "./Schema.js"

export type OperationId = S.StringId
export const OperationId = S.StringId

export class OperationProgress extends S.Opaque<
  OperationProgress,
  OperationProgress.Encoded
>()(S.Struct({
  completed: S.NonNegativeInt,
  total: S.NonNegativeInt
})) {}

export class OperationSuccess
  extends S.Opaque<OperationSuccess, OperationSuccess.Encoded>()(S.TaggedStruct("OperationSuccess", {
    message: S.NullOr(S.NonEmptyString2k).withDefault
  }))
{}

export class OperationFailure
  extends S.Opaque<OperationFailure, OperationFailure.Encoded>()(S.TaggedStruct("OperationFailure", {
    message: S.NullOr(S.NonEmptyString2k).withDefault
  }))
{}

export const OperationResult = S.TaggedUnion(OperationSuccess, OperationFailure)
export type OperationResult = S.Schema.Type<typeof OperationResult>

export class Operation extends S.Opaque<Operation, Operation.Encoded>()(S.Struct({
  id: OperationId,
  title: S.NonEmptyString2k,
  progress: S.optional(OperationProgress),
  result: S.optional(OperationResult),
  createdAt: S.Date.withDefault,
  updatedAt: S.NullOr(S.Date).withDefault
})) {}

// codegen:start {preset: model}
//
export namespace OperationProgress {
  export interface Encoded extends S.Struct.Encoded<typeof OperationProgress["fields"]> {}
}
export namespace OperationSuccess {
  export interface Encoded extends S.Struct.Encoded<typeof OperationSuccess["fields"]> {}
}
export namespace OperationFailure {
  export interface Encoded extends S.Struct.Encoded<typeof OperationFailure["fields"]> {}
}
export namespace Operation {
  export interface Encoded extends S.Struct.Encoded<typeof Operation["fields"]> {}
}
//
// codegen:end
