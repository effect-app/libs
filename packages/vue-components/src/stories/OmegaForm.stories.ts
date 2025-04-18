import type { Meta, StoryObj } from "@storybook/vue3"
import { OmegaForm } from "../components/OmegaForm"
import { provideIntl } from "../utils"
import { type makeIntl } from "@effect-app/vue"
import { ref } from "vue"
import SimpleForm from "./OmegaForm/SimpleForm.vue"
import EmailForm from "./OmegaForm/EmailForm.vue"
import ComplexForm from "./OmegaForm/ComplexForm.vue"
import SimpleFormVuetifyDefault from "./OmegaForm/SimpleFormVuetifyDefault.vue"
import SumExample from "./OmegaForm/SumExample.vue"
import PersistencyForm from "./OmegaForm/PersistencyForm.vue"

const mockIntl = {
  locale: ref("en"),
  trans: (id: string) => id,
  intl: ref({ formatMessage: (msg: { id: string }) => msg.id }),
} as unknown as ReturnType<ReturnType<typeof makeIntl<string>>["useIntl"]>

const meta: Meta<typeof OmegaForm> = {
  title: "Components/OmegaForm",
  component: OmegaForm,
  tags: ["autodocs"],
  argTypes: {
    schema: { control: "object" },
    onSubmit: { action: "submitted" },
    defaultValues: { control: "object" },
  },
  decorators: [
    story => ({
      components: { story },
      setup() {
        provideIntl(mockIntl)
        return {}
      },
      template: "<story />",
    }),
  ],
}

export default meta
type Story = StoryObj<typeof meta>

export const SimpleFormStory: Story = {
  render: () => ({
    components: { SimpleForm },
    template: "<SimpleForm />",
  }),
}

export const EmailFormStory: Story = {
  render: () => ({
    components: { EmailForm },
    template: "<EmailForm />",
  }),
}

export const ComplexFormStory: Story = {
  render: () => ({
    components: { ComplexForm },
    template: "<ComplexForm />",
  }),
}

export const SimpleFormVuetifyDefaultStory: Story = {
  render: () => ({
    components: { SimpleFormVuetifyDefault },
    template: "<SimpleFormVuetifyDefault />",
  }),
}

export const SumExampleStory: Story = {
  render: () => ({
    components: { SumExample },
    template: "<SumExample />",
  }),
}

export const PersistencyFormStory: Story = {
  render: () => ({
    components: { PersistencyForm },
    template: "<PersistencyForm />",
  }),
}
