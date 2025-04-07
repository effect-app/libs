import { type App } from "vue"
import * as components from "./components"

function install(app: App) {
  for (const key in components) {
    if (Object.prototype.hasOwnProperty.call(components, key)) {
      const component = components[key as keyof typeof components]
      if (component && typeof component === "object") {
        app.component(key, component)
      }
    }
  }
}

// import './assets/main.scss'

export default { install }

export * from "./components"
export * from "./constants"
export * from "./utils"
