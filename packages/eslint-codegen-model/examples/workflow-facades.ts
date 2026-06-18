import * as S from "../../effect-app/src/Schema.ts"

class _WorkflowStep extends S.Opaque<_WorkflowStep>()(
  S.Struct({
    id: S.StringId,
    name: S.NonEmptyString255,
    timeout: S.optional(S.Number),
    retryPolicy: S.Struct({
      maxAttempts: S.Int,
      backoff: S.Literals(["fixed", "exponential"]),
      jitter: S.Boolean
    }),
    input: S.Record(S.String, S.Union([S.String, S.Number, S.Boolean, S.Null]))
  })
) {}

// codegen:start {preset: modelFacade, className: _WorkflowStep, schema: S}
export class WorkflowStep
  extends S.OpaqueFacade<
    WorkflowStep,
    WorkflowStep.Encoded,
    WorkflowStep.Make,
    WorkflowStep.DecodingServices,
    WorkflowStep.EncodingServices
  >()(_WorkflowStep)
{}
// codegen:end

class _WorkflowRun extends S.Opaque<_WorkflowRun>()(
  S.Struct({
    id: S.StringId,
    workflowName: S.NonEmptyString255,
    version: S.Int,
    steps: S.NonEmptyArray(WorkflowStep),
    status: S.Union([
      S.TaggedStruct("Queued", {
        queuedAt: S.DateFromString
      }),
      S.TaggedStruct("Running", {
        startedAt: S.DateFromString,
        activeStepId: S.StringId
      }),
      S.TaggedStruct("Completed", {
        completedAt: S.DateFromString,
        result: S.Record(S.String, S.String)
      }),
      S.TaggedStruct("Failed", {
        failedAt: S.DateFromString,
        failedStepId: S.StringId,
        reason: S.NonEmptyString255
      })
    ]),
    history: S.Array(
      S.Struct({
        at: S.DateFromString,
        stepId: S.optional(S.StringId),
        event: S.NonEmptyString255,
        details: S.Record(S.String, S.String)
      })
    )
  })
) {}

// codegen:start {preset: modelFacade, className: _WorkflowRun, schema: S}
export class WorkflowRun
  extends S.OpaqueFacade<
    WorkflowRun,
    WorkflowRun.Encoded,
    WorkflowRun.Make,
    WorkflowRun.DecodingServices,
    WorkflowRun.EncodingServices
  >()(_WorkflowRun)
{}
// codegen:end

// codegen:start {preset: model, static: true, facade: true}
//
export interface WorkflowStep {
  readonly id: S.StringId
  readonly name: S.NonEmptyString255
  readonly retryPolicy: {
    readonly maxAttempts: S.Int
    readonly backoff: "fixed" | "exponential"
    readonly jitter: false | true
  }
  readonly input: { readonly [x: string]: string | number | boolean | null }
  readonly timeout?: undefined | number
}
export namespace WorkflowStep {
  export interface Encoded {
    readonly id: string
    readonly name: string
    readonly retryPolicy: {
      readonly maxAttempts: number
      readonly backoff: "fixed" | "exponential"
      readonly jitter: false | true
    }
    readonly input: { readonly [x: string]: string | number | boolean | null }
    readonly timeout?: undefined | number
  }
  export interface Make {
    readonly id: S.StringId
    readonly name: S.NonEmptyString255
    readonly retryPolicy: {
      readonly maxAttempts: S.Int
      readonly backoff: "fixed" | "exponential"
      readonly jitter: false | true
    }
    readonly input: { readonly [x: string]: string | number | boolean | null }
    readonly timeout?: undefined | number
  }
  export type DecodingServices = never
  export type EncodingServices = never
}
export interface WorkflowRun {
  readonly id: S.StringId
  readonly workflowName: S.NonEmptyString255
  readonly version: S.Int
  readonly steps: readonly [WorkflowStep, ...WorkflowStep[]]
  readonly status:
    | { readonly _tag: "Queued"; readonly queuedAt: Date }
    | { readonly _tag: "Running"; readonly startedAt: Date; readonly activeStepId: S.StringId }
    | { readonly _tag: "Completed"; readonly completedAt: Date; readonly result: { readonly [x: string]: string } }
    | {
      readonly _tag: "Failed"
      readonly failedAt: Date
      readonly failedStepId: S.StringId
      readonly reason: S.NonEmptyString255
    }
  readonly history:
    readonly ({
      readonly at: Date
      readonly event: S.NonEmptyString255
      readonly details: { readonly [x: string]: string }
      readonly stepId?: undefined | S.StringId
    })[]
}
export namespace WorkflowRun {
  export interface Encoded {
    readonly id: string
    readonly workflowName: string
    readonly version: number
    readonly steps: readonly [WorkflowStep.Encoded, ...WorkflowStep.Encoded[]]
    readonly status:
      | { readonly _tag: "Queued"; readonly queuedAt: string }
      | { readonly _tag: "Running"; readonly startedAt: string; readonly activeStepId: string }
      | { readonly _tag: "Completed"; readonly completedAt: string; readonly result: { readonly [x: string]: string } }
      | { readonly _tag: "Failed"; readonly failedAt: string; readonly failedStepId: string; readonly reason: string }
    readonly history:
      readonly ({
        readonly at: string
        readonly event: string
        readonly details: { readonly [x: string]: string }
        readonly stepId?: undefined | string
      })[]
  }
  export interface Make {
    readonly id: S.StringId
    readonly workflowName: S.NonEmptyString255
    readonly version: S.Int
    readonly steps: readonly [WorkflowStep.Make, ...WorkflowStep.Make[]]
    readonly status:
      | { readonly _tag: "Queued"; readonly queuedAt: Date }
      | { readonly _tag: "Running"; readonly startedAt: Date; readonly activeStepId: S.StringId }
      | { readonly _tag: "Completed"; readonly completedAt: Date; readonly result: { readonly [x: string]: string } }
      | {
        readonly _tag: "Failed"
        readonly failedAt: Date
        readonly failedStepId: S.StringId
        readonly reason: S.NonEmptyString255
      }
    readonly history:
      readonly ({
        readonly at: Date
        readonly event: S.NonEmptyString255
        readonly details: { readonly [x: string]: string }
        readonly stepId?: undefined | S.StringId
      })[]
  }
  export type DecodingServices = never
  export type EncodingServices = never
}
//
// codegen:end
