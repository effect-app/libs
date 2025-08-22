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
            .async<Option.Option<string>, ConnectionException>((res) => {
              client.get(key, (err, v) =>
                err
                  ? res(new ConnectionException(err))
                  : res(Effect.sync(() => Option.fromNullable(v))))
            })
            .pipe(Effect.uninterruptible)
        }

        function set(key: string, val: string) {
          return Effect
            .async<void, ConnectionException>((res) => {
              client.set(key, val, (err) =>
                err
                  ? res(new ConnectionException(err))
                  : res(Effect.sync(() => void 0)))
            })
            .pipe(Effect.uninterruptible)
        }

        function hset(key: string, field: string, value: string) {
          return Effect
            .async<void, ConnectionException>((res) => {
              client.hset(key, field, value, (err) =>
                err
                  ? res(new ConnectionException(err))
                  : res(Effect.sync(() => void 0)))
            })
            .pipe(Effect.uninterruptible)
        }

        function hget(key: string, field: string) {
          return Effect
            .async<Option.Option<string>, ConnectionException>((res) => {
              client.hget(key, field, (err, v) =>
                err
                  ? res(new ConnectionException(err))
                  : res(Effect.sync(() => Option.fromNullable(v))))
            })
            .pipe(Effect.uninterruptible)
        }
        function hmgetAll(key: string) {
          return Effect
            .async<Option.Option<{ [key: string]: string }>, ConnectionException>(
              (res) => {
                client.hgetall(key, (err, v) =>
                  err
                    ? res(new ConnectionException(err))
                    : res(Effect.sync(() => Option.fromNullable(v))))
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
        .async<void, Error>((res) => {
          cl.client.quit((err) => res(err ? Effect.fail(err) : Effect.void))
        })
        .pipe(Effect.uninterruptible, Effect.orDie)
  )

export interface RedisClient extends Effect.Effect.Success<ReturnType<typeof makeRedisClient>> {}

export const RedisClient = Context.GenericTag<RedisClient>("@services/RedisClient")

export const RedisClientLayer = (storageUrl: string) =>
  Layer.scoped(RedisClient, makeRedisClient(makeRedis(storageUrl)))

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
