import { Case, Tagged } from "@effect-ts/core/Case"
import * as XChunk from "@effect-ts/core/Collections/Immutable/Chunk"
import * as Map from "@effect-ts/core/Collections/Immutable/Map"
import {
  die,
  dieWith,
  effectAsync,
  effectAsyncInterrupt,
  fail,
  failWith,
  halt,
  haltWith,
  succeed,
  succeedWith,
} from "@effect-ts/core/Effect"
import * as Cause from "@effect-ts/core/Effect/Cause"
import * as Exit from "@effect-ts/core/Effect/Exit"
import * as Layer from "@effect-ts/core/Effect/Layer"
import * as XManaged from "@effect-ts/core/Effect/Managed"
import * as Ref from "@effect-ts/core/Effect/Ref"
import * as Semaphore from "@effect-ts/core/Effect/Semaphore"
import * as Either from "@effect-ts/core/Either"
import * as Equal from "@effect-ts/core/Equal"
import { tag } from "@effect-ts/core/Has"
import * as Ord from "@effect-ts/core/Ord"
import * as Lens from "@effect-ts/monocle/Lens"
import * as XEffect from "@effect-ts-app/core/Effect"
import * as XEffectOption from "@effect-ts-app/core/EffectOption"
import * as NA from "@effect-ts-app/core/NonEmptyArray"
import * as Option from "@effect-ts-app/core/Option"
import * as Schema from "@effect-ts-app/core/Schema"
import * as Set from "@effect-ts-app/core/Set"
import * as Sync from "@effect-ts-app/core/Sync"
import * as XSyncOption from "@effect-ts-app/core/SyncOption"

const gl = global as any

const EffectExtensions = {
  ...XEffect,
  async: effectAsync,
  asyncInterrupt: effectAsyncInterrupt,
  do_: XEffect.do,
  succeedNow: succeed,
  succeed: succeedWith,
  failNow: fail,
  fail: failWith,
  dieNow: die,
  die: dieWith,
  haltNow: halt,
  halt: haltWith,
}

gl.$T = {
  Effect: {
    ...EffectExtensions,
  },
  Map,
  Exit,
  Cause,
  Semaphore,
  Either,
  Layer,
  Ref,
  Option,
  EffectOption: XEffectOption,
  SyncOption: XSyncOption,
  NonEmptyArray: NA,
  Sync,
  Equal,
  Ord,
  Lens,
  Managed: XManaged,
  Chunk: XChunk,
  Set,
  Schema,
  Data: {
    Case,
    Tagged,
    tag,
  },
}
