export interface ApiConfig {
  apiUrl: string
  headers: Opt<HashMap<string, string>>
}

const tag = Tag<ApiConfig>()
export const Live = (config: Config<ApiConfig>) => config.config.toLayer(tag)
export const ApiConfig = {
  Tag: tag,
  Live
}

export const getConfig = <R, E, A>(self: (cfg: ApiConfig) => Effect<R, E, A>) => tag.accessWithEffect(self)
