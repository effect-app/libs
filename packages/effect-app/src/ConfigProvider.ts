import { type ConfigProvider, make, type Path } from "effect/ConfigProvider"
import { dual } from "effect/Function"

/**
 * Scopes a provider so that all lookups are prefixed with the given path
 * segments.
 *
 * When to use:
 * - Namespacing config under a prefix like `"app"` or `"database"`.
 * - Reusing the same provider shape for multiple sub-configs.
 *
 * Accepts a single string or a full `Path` array. The prefix is prepended
 * *after* any `mapInput` transformation runs, so ordering matters when
 * composing with {@link mapInput} or {@link constantCase}.
 *
 * Supports both data-last and data-first calling conventions.
 *
 * **Example** (Nesting under a prefix)
 *
 * ```ts
 * import { ConfigProvider } from "effect"
 *
 * const provider = ConfigProvider.fromEnv({
 *   env: { APP_HOST: "localhost", APP_PORT: "3000" }
 * })
 *
 * // Lookups for ["HOST"] now resolve to ["APP", "HOST"]
 * const scoped = ConfigProvider.nested(provider, "APP")
 * ```
 *
 * @see {@link mapInput} – for arbitrary path transformations
 *
 * @category Combinators
 * @since 4.0.0
 */
export const nested: {
  (prefix: string | Path): (self: ConfigProvider) => ConfigProvider
  (self: ConfigProvider, prefix: string | Path): ConfigProvider
} = dual(
  2,
  (self: ConfigProvider, prefix: string | Path): ConfigProvider => {
    let path: Path = typeof prefix === "string" ? [prefix] : prefix
    if (self.mapInput) path = self.mapInput(path)
    return make(self.get, self.mapInput, self.prefix ? [...self.prefix, ...path] : path)
  }
)

export * from "effect/ConfigProvider"
