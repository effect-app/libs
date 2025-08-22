// export function accessM_<T, I, R, E, A>(self: Tag<T, I>, f: (x: T) => Effect.Effect<R, E, A>) {
//   return Effect.serviceWithEffect(self)(f)
// }

import { Layer } from "effect"

// export function access_<T, I, B>(self: Tag<T, I>, f: (x: T) => B) {
//   return Effect.serviceWith(self)(f)
// }

export const makeLayer = Layer.succeed
