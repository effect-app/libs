import { type Config, make } from "effect/Config"
import { dual } from "effect/Function"

import * as ConfigProvider from "./ConfigProvider.js"

export const nested: {
  (name: string): <A>(self: Config<A>) => Config<A>
  <A>(self: Config<A>, name: string): Config<A>
} = dual(
  2,
  <A>(self: Config<A>, name: string): Config<A> => make((provider) => self.parse(ConfigProvider.nested(provider, name)))
)

export * from "effect/Config"
