import { CosmosClient as ComosClient_ } from "@azure/cosmos"
import * as Context from "effect-app/Context"
import * as Effect from "effect-app/Effect"
import * as Layer from "effect-app/Layer"

const withClient = (url: string) => Effect.sync(() => new ComosClient_(url))

export const makeCosmosClient = (url: string, dbName: string) =>
  Effect.map(withClient(url), (x) => ({ db: x.database(dbName) }))

export class CosmosClient extends Context.Service<CosmosClient, {
  readonly db: ReturnType<InstanceType<typeof ComosClient_>["database"]>
}>()("@services/CosmosClient") {}

export const db = CosmosClient.pipe(Effect.map((_) => _.db))

export const CosmosClientLayer = (cosmosUrl: string, dbName: string) =>
  Layer.effect(CosmosClient, makeCosmosClient(cosmosUrl, dbName))
