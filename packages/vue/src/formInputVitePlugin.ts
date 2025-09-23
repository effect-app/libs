import type { Plugin } from "vite"

// to use: import { formInputVitePlugin } from '@effect-app/vue/vite-plugin' and add it to the vite plugins

export function formInputVitePlugin(): Plugin {
  return {
    name: "form-input-vite-plugin",
    transform(code: string, id: string) {
      if (id.endsWith(".vue")) {
        const transformedCode = code.replace(
          /<form\.Input\b/g,
          "<component :is=\"form.Input\""
        )
        return transformedCode !== code ? transformedCode : null
      }
      return null
    }
  }
}
