import { Context, Data, Effect, Layer, Option } from "effect-app"
import type { RedisClient as Client } from "redis"
import Redlock from "redlock"

export class ConnectionException extends Data.TaggedError("ConnectionException")<{ cause: Error; message: string }> {
  constructor(cause: Error) {
    super({ message: "A connection error ocurred", cause })
  }
}

export const makeRedisClient = (makeClient: () => Client) =>
  Effect.acquireRelease(
    Effect
      .sync(() => {
        const client = createClient(makeClient)
        const lock = new Redlock([client])

        function get(key: string) {
          return Effect
            .callback<Option.Option<string>, ConnectionException>((res) => {
              client.get(key, (err, v) =>
                err
                  ? res(Effect.fail(new ConnectionException(err)))
                  : res(Effect.sync(() => Option.fromNullishOr(v))))
            })
            .pipe(Effect.uninterruptible)
        }

        function set(key: string, val: string) {
          return Effect
            .callback<void, ConnectionException>((res) => {
              client.set(key, val, (err) =>
                err
                  ? res(Effect.fail(new ConnectionException(err)))
                  : res(Effect.sync(() => void 0)))
            })
            .pipe(Effect.uninterruptible)
        }

        function hset(key: string, field: string, value: string) {
          return Effect
            .callback<void, ConnectionException>((res) => {
              client.hset(key, field, value, (err) =>
                err
                  ? res(Effect.fail(new ConnectionException(err)))
                  : res(Effect.sync(() => void 0)))
            })
            .pipe(Effect.uninterruptible)
        }

        function hget(key: string, field: string) {
          return Effect
            .callback<Option.Option<string>, ConnectionException>((res) => {
              client.hget(key, field, (err, v) =>
                err
                  ? res(Effect.fail(new ConnectionException(err)))
                  : res(Effect.sync(() => Option.fromNullishOr(v))))
            })
            .pipe(Effect.uninterruptible)
        }
        function hmgetAll(key: string) {
          return Effect
            .callback<Option.Option<{ [key: string]: string }>, ConnectionException>(
              (res) => {
                client.hgetall(key, (err, v) =>
                  err
                    ? res(Effect.fail(new ConnectionException(err)))
                    : res(Effect.sync(() => Option.fromNullishOr(v))))
              }
            )
            .pipe(Effect.uninterruptible)
        }

        return {
          client,
          lock,

          get,
          hget,
          hset,
          hmgetAll,
          set
        }
      }),
    (cl) =>
      Effect
        .callback<void, Error>((res) => {
          cl.client.quit((err) => res(err ? Effect.fail(err) : Effect.void))
        })
        .pipe(Effect.uninterruptible, Effect.orDie)
  )

export class RedisClient extends Context.Service<RedisClient, {
  readonly client: Client
  readonly lock: Redlock
  readonly get: (key: string) => Effect.Effect<Option.Option<string>, ConnectionException>
  readonly hget: (key: string, field: string) => Effect.Effect<Option.Option<string>, ConnectionException>
  readonly hset: (key: string, field: string, value: string) => Effect.Effect<void, ConnectionException>
  readonly hmgetAll: (key: string) => Effect.Effect<Option.Option<{ [key: string]: string }>, ConnectionException>
  readonly set: (key: string, val: string) => Effect.Effect<void, ConnectionException>
}>()("@services/RedisClient") {}

export const RedisClientLayer = (storageUrl: string) =>
  Layer.effect(RedisClient, makeRedisClient(makeRedis(storageUrl)))

function createClient(makeClient: () => Client) {
  const client = makeClient()
  client.on("error", (error) => {
    console.error(error)
  })
  return client
}

function makeRedis(storageUrl: string) {
  const url = new URL(storageUrl)
  const hostname = url.hostname
  const password = url.password
  return () =>
    createClient(
      storageUrl === "redis://"
        ? ({
          host: hostname,
          port: 6380,
          auth_pass: password,
          tls: { servername: hostname }
        } as any)
        : (storageUrl as any)
    )
}
