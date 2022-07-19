import { pipe } from "@effect-ts/core"
import * as MAN from "@effect-ts/core/Effect/Managed"

import { applyFunctions, makeAutoFuncs } from "./util.js"

const BasePrototype = MAN.ManagedImpl.prototype as any

const exceptions: Partial<Record<keyof typeof MAN, string | null>> = {}

const funcs = {
  ...makeAutoFuncs(MAN, exceptions),
}

applyFunctions(funcs, BasePrototype, "Managed")
BasePrototype.pipe = function (...args: [any]) {
  return pipe(this, ...args)
}
