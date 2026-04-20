import { CosmosClient as CosmosClient__ } from "@azure/cosmos"
import { Context, Effect, Layer } from "effect-app"

const cosmosRetryOptions = {
  maxRetryAttemptCount: 25,
  fixedRetryIntervalInMilliseconds: 0,
  maxWaitTimeInSeconds: 120
}

const withClient = (url: string) =>
  Effect.sync(() => {
    const endpointMatch = url.match(/AccountEndpoint=([^;]+)/)
    const keyMatch = url.match(/AccountKey=([^;]+)/)
    if (endpointMatch) {
      return new CosmosClient__({
        endpoint: endpointMatch[1]!,
        key: keyMatch?.[1],
        connectionPolicy: { retryOptions: cosmosRetryOptions }
      })
    }
    return new CosmosClient__(url)
  })

export const makeCosmosClient = (url: string, dbName: string) =>
  Effect.map(withClient(url), (x) => ({ db: x.database(dbName) }))

export class CosmosClient extends Context.Service<CosmosClient, {
  readonly db: ReturnType<InstanceType<typeof CosmosClient__>["database"]>
}>()("@services/CosmosClient") {}

export const db = CosmosClient.asEffect().pipe(Effect.map((_) => _.db))

export const CosmosClientLayer = (cosmosUrl: string, dbName: string) =>
  Layer.effect(CosmosClient, makeCosmosClient(cosmosUrl, dbName))
