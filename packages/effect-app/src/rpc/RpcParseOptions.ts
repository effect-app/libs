import { Rpc, type RpcGroup } from "effect/rpc"
import { DefaultParseOptions } from "../Schema/ext.ts"

/**
 * Apply {@link DefaultParseOptions} to every RPC in `group`.
 *
 * `RpcClient` and `RpcServer` read `Rpc.ParseOptions` when encoding and decoding
 * payloads, successes, stream chunks, and exits. Schema `parseOptions` annotations
 * are not consulted. Call this after `prefix` and `middleware`, which clone RPCs.
 */
export const annotateRpcParseOptions = <R extends Rpc.Any>(group: RpcGroup.RpcGroup<R>): RpcGroup.RpcGroup<R> =>
  group.annotateRpcs(Rpc.ParseOptions, DefaultParseOptions)
