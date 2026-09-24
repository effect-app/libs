import { type ContainerRequest, CosmosClient as ComosClient_ } from "@azure/cosmos"
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

export interface CosmosContainerThroughput {
  /**
   * Autoscale max RU/s for containers created on demand (min 1000; Cosmos bills at
   * least 10% of it). Only applied to containers that do not exist yet, in databases
   * without shared throughput — those containers share the database pool instead.
   * Unset keeps the Cosmos default: manual 400 RU/s per container, billed 24/7.
   */
  readonly autoscaleMaxThroughput?: number | undefined
}

/** The slice of a Cosmos `Database` needed to create containers. */
export interface ContainerDb {
  readonly container: (id: string) => { readonly read: () => Promise<unknown> }
  readonly containers: { readonly createIfNotExists: (body: ContainerRequest) => Promise<unknown> }
  readonly readOffer: () => Promise<{ readonly resource?: unknown }>
}

const isNotFound = (e: unknown) => typeof e === "object" && e !== null && "code" in e && e.code === 404

const isServerlessOfferError = (error: unknown): boolean => {
  const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined
  const message = error instanceof Error
    ? error.message
    : typeof error === "object" && error !== null && "message" in error
    ? String(error.message)
    : String(error)
  const badRequest = code === 400 || code === "BadRequest" || code === "400"
  return badRequest && message.toLowerCase().includes("not supported for serverless")
}

export const createContainerIfNotExists = async (
  db: ContainerDb,
  body: ContainerRequest & { id: string },
  throughput?: CosmosContainerThroughput
) => {
  const maxThroughput = throughput?.autoscaleMaxThroughput
  if (maxThroughput === undefined) {
    await db.containers.createIfNotExists(body)
    return
  }
  const exists = await db.container(body.id).read().then(
    () => true,
    (e) => isNotFound(e) ? false : Promise.reject(e)
  )
  if (exists) return
  try {
    const { resource: sharedOffer } = await db.readOffer()
    await db.containers.createIfNotExists(sharedOffer ? body : { ...body, maxThroughput })
  } catch (error) {
    if (!isServerlessOfferError(error)) throw error
    await db.containers.createIfNotExists(body)
  }
}
