import { type makeIntl } from "@effect-app/vue"
import { type Meta, type StoryObj } from "@storybook/vue3"
import { ref } from "vue"
import { provideIntl } from "../src"
import One from "./Commands/One.vue"

const mockIntl = {
  locale: ref("en"),
  trans: (id: string) => id,
  intl: ref({ formatMessage: (msg: { id: string }) => msg.id })
} as unknown as ReturnType<ReturnType<typeof makeIntl<string>>["useIntl"]>

const meta: Meta = {
  title: "Components/Commands",
  // component: Commands,
  // argTypes: {
  //   schema: { control: "object" },
  //   onSubmit: { action: "submitted" },
  //   defaultValues: { control: "object" }
  // },
  decorators: [
    (story) => ({
      components: { story },
      setup() {
        provideIntl(() => mockIntl)
        return {}
      },
      template: "<story />"
    })
  ]
}

export default meta
type Story = StoryObj<typeof meta>

export const OneStory: Story = {
  render: () => ({
    components: { One },
    template: "<One />"
  })
}
