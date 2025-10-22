import type { Meta as StoryMeta, StoryObj } from "@storybook/vue3"
import Dialog from "../src/components/Dialog.vue"
import AsyncBlockingComponent from "./Dialog/AsyncBlocking.vue"
import SimpleBlockingComponent from "./Dialog/SimpleBlocking.vue"
import UploadBlockingComponent from "./Dialog/UploadBlocking.vue"

const meta: StoryMeta<typeof Dialog> = {
  title: "Components/Dialog",
  component: Dialog
}

export default meta
type Story = StoryObj<typeof Dialog>

export const SimpleBlocking: Story = {
  render: () => ({
    components: { SimpleBlockingComponent },
    template: "<SimpleBlockingComponent />"
  })
}

export const AsyncBlocking: Story = {
  render: () => ({
    components: { AsyncBlockingComponent },
    template: "<AsyncBlockingComponent />"
  })
}

export const UploadBlocking: Story = {
  render: () => ({
    components: { UploadBlockingComponent },
    template: "<UploadBlockingComponent />"
  })
}
