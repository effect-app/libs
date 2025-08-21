// Nice way to underline types that are only there for type testing, not for production use
// sadly with unique symbols we get weird issues in app projects.
// api/src/X/PackList.Controllers.ts:21:1 - error TS4082: Default export of the module has or is using private name 'TypeTestId'
// export const TypeTestId: unique symbol = Symbol.for("@effect/infra/type-test")
// export type TypeTestId = typeof TypeTestId
export const TypeTestId = "effect-app/type-test" as const
export type TypeTestId = typeof TypeTestId
