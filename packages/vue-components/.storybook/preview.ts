import { type Preview, setup } from "@storybook/vue3"
import { createVuetify } from "vuetify"
import "vuetify/styles"
import * as components from "vuetify/components"
import * as directives from "vuetify/directives"

import { aliases, mdi } from "vuetify/iconsets/mdi-svg"

// Import highlight.js
import VueHighlightJS from "vue3-highlightjs"
import "highlight.js/styles/default.css" // Or your preferred theme

import Toast from "vue-toastification"

// Import the CSS or use your own!
import "vue-toastification/dist/index.css"

const vuetify = createVuetify({
  components,
  directives,
  icons: {
    defaultSet: "mdi",
    aliases,
    sets: {
      mdi
    }
  }
})

setup((app) => {
  // Register Vuetify
  app.use(vuetify)
  // Register highlight.js
  app.use(VueHighlightJS)
  app.use("default" in Toast ? (Toast as any).default : Toast, {})
})

const preview: Preview = {
  parameters: {
    actions: { argTypesRegex: "^on[A-Z].*" },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i
      }
    }
  }
}

export default preview
