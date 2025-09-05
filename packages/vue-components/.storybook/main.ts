import type { StorybookConfig } from "@storybook/vue3-vite"

const config: StorybookConfig = {
  stories: [
    "../stories/**/*.mdx",
    "../stories/**/*.stories.@(js|jsx|mjs|ts|tsx)"
  ],
  addons: [],
  framework: {
    name: "@storybook/vue3-vite",
    options: {}
  }
}
export default config
