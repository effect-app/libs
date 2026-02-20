/* eslint-disable @typescript-eslint/no-explicit-any */
import { Rpc } from "effect/unstable/rpc"
import type { GetContextConfig, GetEffectError, RequestContextMapTagAny } from "../rpc/RpcContextMap.js"
import * as S from "../Schema.js"
import { AST } from "../Schema.js"

// TODO: Fix error types... (?)
type JoinSchema<T> = T extends ReadonlyArray<S.Schema.All> ? S.Union<T> : typeof S.Never

const merge = (a: any, b: Array<any>) =>
  a !== undefined && b.length ? S.Union(a, ...b) : a !== undefined ? a : b.length ? S.Union(...b) : S.Never

/**
 * Whatever the input, we will only decode or encode to void
 */
const ForceVoid: S.Schema<void> = S.transform(S.Any, S.Void, { decode: () => void 0, encode: () => void 0 })

export const makeRpcClient = <
  RequestContextMap extends RequestContextMapTagAny,
  GeneralErrors extends S.Schema.All = never
>(rcs: RequestContextMap, generalErrors?: GeneralErrors) => {
  type RequestConfig = GetContextConfig<RequestContextMap["config"]>

  function rpc<
    const Tag extends string,
    Payload extends S.Struct.Fields | S.Schema.Any = typeof S.Void,
    Success extends S.Schema.Any = typeof S.Void,
    Error extends S.Schema.All = typeof S.Never,
    C extends RequestConfig = {}
  >(
    tag: Tag,
    options?: {
      readonly payload?: Payload
      readonly success?: Success
      readonly error?: Error
      readonly config?: C
    }
  ):
    & Rpc.Rpc<
      Tag,
      Payload extends S.Struct.Fields ? S.TypeLiteral<Payload, []> : Payload,
      Success,
      JoinSchema<[Error | GetEffectError<RequestContextMap["config"], C> | GeneralErrors]>
    >
    & { config: C }
  {
    // TODO: filter errors based on config + take care of inversion
    const errorSchemas = Object.values(rcs.config).map((_: any) => _.error)
    const error = merge(
      options?.error,
      [...errorSchemas, generalErrors].filter(Boolean)
    )

    const payload = options?.payload
      ? S.isSchema(options.payload)
        ? AST.isVoidKeyword((options.payload as S.Schema<any>).ast) ? S.Void : options.payload as any
        : S.Struct(options.payload as S.Struct.Fields) as any
      : S.Void as any

    const success = options?.success
      ? S.isSchema(options.success)
        ? AST.isVoidKeyword(options.success.ast) ? ForceVoid : options.success
        : S.Struct(options.success as any)
      : ForceVoid as any

    const rpcDef = Rpc.make(tag, { payload, success, error }) as any
    const config = options?.config ?? {} as C

    return Object.assign(rpcDef, { config })
  }

  return {
    rpc
  }
}
