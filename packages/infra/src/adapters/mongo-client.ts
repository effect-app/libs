import { Context, Effect, Layer } from "effect-app"
import { MongoClient as MongoClient_ } from "mongodb"

// TODO: we should probably share a single client...

const withClient = (url: string) =>
  Effect.acquireRelease(
    Effect
      .promise(() => {
        const client = new MongoClient_(url)
        return client.connect()
      }),
    (cl) => Effect.promise(() => cl.close()).pipe(Effect.uninterruptible, Effect.orDie)
  )

const makeMongoClient = (url: string, dbName?: string) => Effect.map(withClient(url), (x) => ({ db: x.db(dbName) }))

export interface MongoClient extends Effect.Effect.Success<ReturnType<typeof makeMongoClient>> {}

export const MongoClient = Context.GenericTag<MongoClient>("@services/MongoClient")

export const MongoClientLive = (mongoUrl: string, dbName?: string) =>
  Layer.scoped(MongoClient, makeMongoClient(mongoUrl, dbName))
