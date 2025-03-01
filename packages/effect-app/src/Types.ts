export * from "effect/Types"

export type DeepMutable<T> = T extends ReadonlyMap<infer K, infer V> ? Map<DeepMutable<K>, DeepMutable<V>>
  : T extends ReadonlySet<infer V> ? Set<DeepMutable<V>>
  : [keyof T] extends [never] ? T
  // keep brands alive
  : T extends string ? T
  : { -readonly [K in keyof T]: DeepMutable<T[K]> }

export type Mutable<T> = {
  -readonly [P in keyof T]: T[P]
}

export type DistributiveOmit<T, K extends keyof any> = T extends any ? Omit<T, K>
  : never
