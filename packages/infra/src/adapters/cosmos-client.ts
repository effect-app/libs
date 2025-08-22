import { CosmosClient as ComosClient_ } from "@azure/cosmos"
import { Context, Effect, Layer } from "effect-app"

const withClient = (url: string) => Effect.sync(() => new ComosClient_(url))

export const makeCosmosClient = (url: string, dbName: string) =>
  Effect.map(withClient(url), (x) => ({ db: x.database(dbName) }))

export interface CosmosClient extends Effect.Effect.Success<ReturnType<typeof makeCosmosClient>> {}

export const CosmosClient = Context.GenericTag<CosmosClient>("@services/CosmosClient")

export const db = Effect.map(CosmosClient, (_) => _.db)

export const CosmosClientLayer = (cosmosUrl: string, dbName: string) =>
  Layer.effect(CosmosClient, makeCosmosClient(cosmosUrl, dbName))
