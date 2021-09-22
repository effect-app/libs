import {
  ChunkInternal,
  concat_,
  filter_,
  filterMap_,
  find_,
  flatten,
  from,
  head,
  map_,
  toArray,
  unsafeLast,
} from "@effect-ts/core/Collections/Immutable/Chunk"
import {
  collectAll,
  forEach_,
  forEachPar_,
  forEachParN_,
} from "@effect-ts-app/core/Effect"

const BasePrototype = ChunkInternal.prototype as any

const funcs = {
  head,
  toArray,
  unsafeLast,
  flatten,
  //mapWithIndex: mapWithIndex_,
  filterMap: filterMap_,
  filter: filter_,
  map: map_,
  find: find_,
  concat_,
  //findFirst: findFirst_,
  //findFirstMap: findFirstMap_,
  //sortWith: sort_,
  //sortBy: sortBy_,
  //uniq: uniq_,

  // IterableOps
  collectAll,
  forEachParN: forEachParN_,
  forEachPar: forEachPar_,
  forEachEff: forEach_,

  toChunk: from,
}

Object.entries(funcs).forEach(([k, v]) => {
  const f = v as any
  BasePrototype[k] = function (...args: [any]) {
    return f(this, ...args)
  }
})
