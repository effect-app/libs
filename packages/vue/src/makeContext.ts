import { inject, type InjectionKey, provide } from "vue"

export const makeContext: {
  <T>(def: T): {
    use: () => T
    provide: (locale: T) => void
  }
  <T>(def?: T): {
    use: () => T | undefined
    provide: (locale: T) => void
  }
} = <T>(def?: T) => {
  const key = Symbol() as InjectionKey<T>
  return {
    use: () => inject(key, def),
    provide: (locale: T) => provide(key, locale)
  }
}

export const injectCertain = <T>(key: InjectionKey<T>) => {
  const v = inject(key)
  if (v === undefined) {
    throw new Error(`Injectionkey ${key.toString()} not found`)
  }
  return v
}

export const makeContextCertain = <T>() => {
  const key = Symbol() as InjectionKey<T>
  return {
    use: () => injectCertain(key),
    provide: (locale: T) => provide(key, locale)
  }
}
