import type { Meta as StoryMeta, StoryObj } from "@storybook/vue3"
import { vueRouter } from "storybook-vue3-router"
import Demo from "./FixedNuxtErrorBoundary/Demo.vue"

const meta: StoryMeta = {
  title: "Components/FixedNuxtErrorBoundary"
}

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  decorators: [vueRouter()],
  render: () => ({
    components: { Demo },
    template: "<Demo />"
  })
}
