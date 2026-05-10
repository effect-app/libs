import * as Context from "effect-app/Context"
import * as Effect from "effect-app/Effect"
import * as Layer from "effect-app/Layer"
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

export class MongoClient extends Context.Service<MongoClient, {
  readonly db: ReturnType<InstanceType<typeof MongoClient_>["db"]>
}>()("@services/MongoClient") {}

export const MongoClientLive = (mongoUrl: string, dbName?: string) =>
  Layer.effect(MongoClient, makeMongoClient(mongoUrl, dbName))
