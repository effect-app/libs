/* eslint-disable @typescript-eslint/no-explicit-any */
import { RpcMiddleware } from "@effect/rpc"
import { type TagClass } from "@effect/rpc/RpcMiddleware"
import { type Context, type Schema } from "effect-app"

type RpcOptionsOriginal = {
  readonly wrap?: boolean
  readonly optional?: boolean
  readonly failure?: Schema.Schema.All
  readonly provides?: Context.Tag<any, any>
  readonly requiredForClient?: boolean
}

export const Tag = <Self>(): <
  const Name extends string,
  const Options extends RpcOptionsOriginal
>(
  id: Name,
  options?: Options | undefined
) => TagClass<Self, Name, Options> => RpcMiddleware.Tag<Self>()
