import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import { HttpEffect } from "effect/http"
import * as Layer from "effect/Layer"
import * as EffectRequest from "effect/Request"
import * as RequestResolver from "effect/RequestResolver"
import { Rpc, RpcGroup, RpcMiddleware, RpcSerialization, RpcServer } from "effect/rpc"
import type * as SchemaAST from "effect/SchemaAST"
import * as SchemaTransformation from "effect/SchemaTransformation"
import { expect, test } from "vitest"
import { makeRpcClient, makeRpcGroupFromRequestsAndModuleName, NotLoggedInError } from "../src/client.js"
import { S } from "../src/index.js"
import { RpcContextMap } from "../src/rpc.js"
import { annotateRpcParseOptions } from "../src/rpc/RpcParseOptions.js"
import { DefaultParseOptions } from "../src/Schema/ext.js"

const RequestContextMap = RpcContextMap.makeMap({
  allowAnonymous: RpcContextMap.makeInverted()(NotLoggedInError)
})

const stubMiddleware = {
  requestContextMap: RequestContextMap.config,
  requestContext: undefined
}

const parseOptionsOf = (ast: SchemaAST.AST): unknown => {
  const seen = new Set<SchemaAST.AST>()
  const visit = (node: SchemaAST.AST): unknown => {
    if (seen.has(node)) return undefined
    seen.add(node)
    const parseOptions = node.annotations?.["parseOptions"]
    if (parseOptions !== undefined) return parseOptions
    if (node.encoding !== undefined) {
      for (const link of node.encoding) {
        const found = visit(link.to)
        if (found !== undefined) return found
      }
    }
    return undefined
  }
  return visit(ast)
}

const expectNoParseOptions = (schema: { readonly ast: SchemaAST.AST }) => {
  expect(parseOptionsOf(schema.ast)).toBeUndefined()
}

const makeUser = (batches: Array<Array<number>>) => {
  class GetUser extends EffectRequest.TaggedClass("GetUser")<{ readonly id: number }, string> {}
  const resolver = RequestResolver.fromFunctionBatched<GetUser>((entries) => {
    const ids = entries.map((entry) => entry.request.id)
    batches.push(ids)
    return ids.map((id) => `user-${id}`)
  })
  return S.Number.pipe(
    S.decodeTo(
      S.String,
      SchemaTransformation.transformEffect({
        decode: (id) => Effect.request(new GetUser({ id }), resolver),
        encode: (user) => Effect.succeed(Number(user.slice("user-".length)))
      })
    )
  )
}

const readExits = (body: string): Array<unknown> =>
  body.split("\n").flatMap((line) => {
    const trimmed = line.trim()
    if (trimmed.length === 0) return []
    const parsed: unknown = JSON.parse(trimmed)
    if (typeof parsed !== "object" || parsed === null || !("_tag" in parsed) || parsed._tag !== "Exit") {
      return []
    }
    return "exit" in parsed ? [parsed.exit] : []
  })

const postUsers = (annotate: boolean) => {
  const batches: Array<Array<number>> = []
  const User = makeUser(batches)
  const rpc = Rpc.make("getUsers", {
    payload: S.Struct({ users: S.Array(User) }),
    success: S.Array(S.String)
  })
  const group = annotate ? annotateRpcParseOptions(RpcGroup.make(rpc)) : RpcGroup.make(rpc)
  return Effect.gen(function* () {
    const httpEffect = yield* RpcServer.toHttpEffect(group).pipe(
      Effect.provide(
        Layer.mergeAll(
          group.toLayer({
            getUsers: ({ users }) => Effect.succeed(users)
          }),
          RpcSerialization.layerNdjson
        )
      )
    )
    const handler = HttpEffect.toWebHandler(httpEffect)
    const response = yield* Effect.promise(() =>
      handler(
        new Request("http://test/rpc", {
          method: "POST",
          body: `{"_tag":"Request","id":1,"tag":"getUsers","payload":{"users":[1,2,3]},"headers":[]}\n`
        })
      )
    )
    const body = yield* Effect.promise(() => response.text())
    return { batches, body, exits: readExits(body) }
  }).pipe(Effect.scoped)
}

test("schema constructors do not carry parseOptions concurrency", () => {
  expectNoParseOptions(S.Struct({ name: S.String }))
  expectNoParseOptions(S.Struct({ name: S.String }).mapFields((fields) => ({ ...fields, extra: S.Finite })))
  expectNoParseOptions(S.Array(S.String))
  expectNoParseOptions(S.NonEmptyArray(S.String))
  expectNoParseOptions(S.Record(S.String, S.Finite))
  expectNoParseOptions(S.ReadonlySetFromArray(S.String))
  expectNoParseOptions(S.ReadonlyMapFromArray({ key: S.String, value: S.Finite }))

  class Person extends S.Class<Person>("Person")({ name: S.String }) {}
  class Circle extends S.TaggedClass<Circle>()("Circle", { radius: S.Finite }) {}
  class Missing extends S.ErrorClass<Missing>("Missing")({ reason: S.String }) {}
  class Boom extends S.TaggedErrorClass<Boom>()("Boom", { reason: S.String }) {}

  expectNoParseOptions(Person)
  expectNoParseOptions(Person.mapFields((fields) => ({ ...fields, extra: S.Finite })))
  expectNoParseOptions(Circle)
  expectNoParseOptions(Circle.mapFields((fields) => ({ ...fields })))
  expectNoParseOptions(Missing)
  expectNoParseOptions(Boom)
})

test("schema array decode stays sequential unless the caller passes parse options", async () => {
  const batches: Array<Array<number>> = []
  const User = makeUser(batches)
  const schema = S.Array(User)

  expect(await Effect.runPromise(S.decodeUnknownEffect(schema)([1, 2, 3]))).toEqual(["user-1", "user-2", "user-3"])
  expect(batches).toEqual([[1], [2], [3]])

  batches.length = 0
  expect(await Effect.runPromise(S.decodeUnknownEffectConcurrently(schema)([1, 2, 3]))).toEqual([
    "user-1",
    "user-2",
    "user-3"
  ])
  expect(batches).toEqual([[1, 2, 3]])
})

test("annotateRpcParseOptions sets DefaultParseOptions after prefix and middleware", () => {
  class Marker extends RpcMiddleware.Service<Marker>()("Marker") {}
  const plain = RpcGroup.make(Rpc.make("ping", { success: S.String }))
  const plainRpc = [...plain.requests.values()][0]
  if (plainRpc === undefined) throw new Error("expected ping rpc")
  expect(Context.getUnsafe(plainRpc.annotations, Rpc.ParseOptions).concurrency).toBeUndefined()

  const group = annotateRpcParseOptions(plain.prefix("Mod.").middleware(Marker))
  expect([...group.requests.keys()]).toEqual(["Mod.ping"])
  const rpc = group.requests.get("Mod.ping")
  if (rpc === undefined) throw new Error("expected Mod.ping rpc")
  expect(Context.getUnsafe(rpc.annotations, Rpc.ParseOptions)).toBe(DefaultParseOptions)
  expect(rpc.middlewares.has(Marker)).toBe(true)
})

test("makeRpcGroupFromRequestsAndModuleName annotates every rpc", () => {
  const { TaggedRequestFor } = makeRpcClient(stubMiddleware)
  const Query = TaggedRequestFor("Users").Query
  class GetStats extends Query<GetStats>()(
    "GetStats",
    { ids: S.Array(S.String) },
    {
      success: S.Array(S.String)
    }
  ) {}

  const group = makeRpcGroupFromRequestsAndModuleName({ GetStats }, "Users")
  const rpcs = [...group.requests.values()]
  expect(rpcs.length).toBeGreaterThan(0)
  for (const rpc of rpcs) {
    expect(Context.getUnsafe(rpc.annotations, Rpc.ParseOptions)).toBe(DefaultParseOptions)
  }
})

test("Rpc.ParseOptions makes server payload decode batch Effect.request calls", async () => {
  const sequential = await Effect.runPromise(postUsers(false))
  expect(sequential.exits, sequential.body).toEqual([
    {
      _tag: "Success",
      value: ["user-1", "user-2", "user-3"]
    }
  ])
  expect(sequential.batches).toEqual([[1], [2], [3]])

  const concurrent = await Effect.runPromise(postUsers(true))
  expect(concurrent.exits, concurrent.body).toEqual([
    {
      _tag: "Success",
      value: ["user-1", "user-2", "user-3"]
    }
  ])
  expect(concurrent.batches).toEqual([[1, 2, 3]])
})
