import { CosmosClient as ComosClient_ } from "@azure/cosmos"
import { Effect, Layer, ServiceMap } from "effect-app"

const withClient = (url: string) => Effect.sync(() => new ComosClient_(url))

export const makeCosmosClient = (url: string, dbName: string) =>
  Effect.map(withClient(url), (x) => ({ db: x.database(dbName) }))

export class CosmosClient extends ServiceMap.Service<CosmosClient, {
  readonly db: ReturnType<InstanceType<typeof ComosClient_>["database"]>
}>()("@services/CosmosClient") {}

export const db = CosmosClient.asEffect().pipe(Effect.map((_) => _.db))

export const CosmosClientLayer = (cosmosUrl: string, dbName: string) =>
  Layer.effect(CosmosClient, makeCosmosClient(cosmosUrl, dbName))
