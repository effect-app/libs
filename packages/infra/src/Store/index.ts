/* eslint-disable @typescript-eslint/no-explicit-any */
import { Effect, Layer, Redacted } from "effect-app"
import { CosmosStoreLayer } from "./Cosmos.js"
import { DiskStoreLayer } from "./Disk.js"
import { MemoryStoreLive } from "./Memory.js"
// import { RedisStoreLayer } from "./Redis.js"
import type { StorageConfig } from "./service.js"

export function StoreMakerLayer(cfg: StorageConfig) {
  return Effect
    .sync(() => {
      const storageUrl = Redacted.value(cfg.url)
      if (storageUrl.startsWith("mem://")) {
        console.log("Using in memory store")
        return MemoryStoreLive
      }
      if (storageUrl.startsWith("disk://")) {
        const dir = storageUrl.replace("disk://", "")
        console.log("Using disk store at " + dir)
        return DiskStoreLayer(cfg, dir)
      }
      // if (storageUrl.startsWith("redis://")) {
      //   console.log("Using Redis store")
      //   return RedisStoreLayer(cfg)
      // }

      console.log("Using Cosmos DB store")
      return CosmosStoreLayer(cfg)
    })
    .pipe(Layer.unwrapEffect)
}

export * from "./service.js"
