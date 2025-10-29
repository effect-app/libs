import { type makeIntl } from "@effect-app/vue"
import type { Meta as StoryMeta, StoryObj } from "@storybook/vue3"
import { ref } from "vue"
import OmegaForm from "../src/components/OmegaForm/OmegaWrapper.vue"
import { provideIntl } from "../src/utils"
import ArrayComponent from "./OmegaForm/Array.vue"
import AutoGenerationComponent from "./OmegaForm/AutoGeneration.vue"
import BooleansComponent from "./OmegaForm/Booleans.vue"
import ClearableComponent from "./OmegaForm/Clearable.vue"
import ComplexFormComponent from "./OmegaForm/ComplexForm.vue"
import CreateUseFormWithCustomInputComponent from "./OmegaForm/createUseFormWIthCustomInput.vue"
import CustomInputClassNameComponent from "./OmegaForm/CustomInputClassName.vue"
import DateComponent from "./OmegaForm/Date.vue"
import DialogBlockingExamplesComponent from "./OmegaForm/DialogBlockingExamples.vue"
import EmailFormComponent from "./OmegaForm/EmailForm.vue"
import FormInputComponent from "./OmegaForm/form.Input.vue"
import FormTaggedUnionComponent from "./OmegaForm/FormTaggedUnion.vue"
import IntersectionExampleComponent from "./OmegaForm/IntersectionExample.vue"
import MetaFormComponent from "./OmegaForm/Meta.vue"
import NullComponent from "./OmegaForm/Null.vue"
import PersistencyFormComponent from "./OmegaForm/PersistencyForm.vue"
import ProgrammaticallyHandleSubmitCheckErrorsComponent from "./OmegaForm/ProgrammaticallyHandleSubmitCheckErrors.vue"
import SetErrorOnSubmitComponent from "./OmegaForm/SetErrorOnSubmit.vue"
import SimpleFormComponent from "./OmegaForm/SimpleForm.vue"
import SimpleFormVuetifyDefaultComponent from "./OmegaForm/SimpleFormVuetifyDefault.vue"
import SumExampleComponent from "./OmegaForm/SumExample.vue"
import TanstackComponent from "./OmegaForm/Tanstack.vue"
import UnionComponent from "./OmegaForm/Union.vue"
import UsingOmegaFormComponent from "./OmegaForm/UsingOmegaForm.vue"
import WindowExitPreventionComponent from "./OmegaForm/WindowExitPrevention.vue"

const mockIntl = {
  locale: ref("en"),
  trans: (id: string) => id,
  intl: ref({ formatMessage: (msg: { id: string }) => msg.id })
} as unknown as ReturnType<ReturnType<typeof makeIntl<string>>["useIntl"]>

const meta: StoryMeta<typeof OmegaForm> = {
  title: "Components/OmegaForm",
  component: OmegaForm as any,
  argTypes: {
    schema: { control: "object" },
    onSubmit: { action: "submitted" },
    defaultValues: { control: "object" }
  },
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

export const UsingOmegaForm: Story = {
  render: () => ({
    components: { UsingOmegaFormComponent },
    template: "<UsingOmegaFormComponent />"
  })
}

export const SimpleForm: Story = {
  render: () => ({
    components: { SimpleFormComponent },
    template: "<SimpleFormComponent />"
  })
}

export const CreateUseFormWIthCustomInput: Story = {
  render: () => ({
    components: { CreateUseFormWithCustomInputComponent },
    template: "<CreateUseFormWithCustomInputComponent />"
  })
}
export const FormTaggedUnion: Story = {
  render: () => ({
    components: { FormTaggedUnionComponent },
    template: "<FormTaggedUnionComponent />"
  })
}

export const IntersectionExample: Story = {
  render: () => ({
    components: { IntersectionExampleComponent },
    template: "<IntersectionExampleComponent />"
  })
}

export const EmailForm: Story = {
  render: () => ({
    components: { EmailFormComponent },
    template: "<EmailFormComponent />"
  })
}

export const ComplexForm: Story = {
  render: () => ({
    components: { ComplexFormComponent },
    template: "<ComplexFormComponent />"
  })
}

export const SimpleFormVuetifyDefault: Story = {
  render: () => ({
    components: { SimpleFormVuetifyDefaultComponent },
    template: "<SimpleFormVuetifyDefaultComponent />"
  })
}

export const SumExample: Story = {
  render: () => ({
    components: { SumExampleComponent },
    template: "<SumExampleComponent />"
  })
}

export const PersistencyForm: Story = {
  render: () => ({
    components: { PersistencyFormComponent },
    template: "<PersistencyFormComponent />"
  })
}

export const AutoGeneration: Story = {
  render: () => ({
    components: { AutoGenerationComponent },
    template: "<AutoGenerationComponent />"
  })
}

export const Meta: Story = {
  render: () => ({
    components: { MetaFormComponent },
    template: "<MetaFormComponent />"
  })
}

export const FormInput: Story = {
  render: () => ({
    components: { FormInputComponent },
    template: "<FormInputComponent />"
  })
}

export const Clearable: Story = {
  render: () => ({
    components: { ClearableComponent },
    template: "<ClearableComponent />"
  })
}

export const Booleans: Story = {
  render: () => ({
    components: { BooleansComponent },
    template: "<BooleansComponent />"
  })
}

export const Date: Story = {
  render: () => ({
    components: { DateComponent },
    template: "<DateComponent />"
  })
}
export const Array: Story = {
  render: () => ({
    components: { ArrayComponent },
    template: "<ArrayComponent />"
  })
}

export const Tanstack: Story = {
  render: () => ({
    components: { TanstackComponent },
    template: "<TanstackComponent />"
  })
}

export const Union: Story = {
  render: () => ({
    components: { UnionComponent },
    template: "<UnionComponent />"
  })
}

export const ProgrammaticallyHandleSubmitCheckErrors: Story = {
  render: () => ({
    components: { ProgrammaticallyHandleSubmitCheckErrorsComponent },
    template: "<ProgrammaticallyHandleSubmitCheckErrorsComponent />"
  })
}

export const Null: Story = {
  render: () => ({
    components: { NullComponent },
    template: "<NullComponent />"
  })
}

export const SetErrorOnSubmit: Story = {
  render: () => ({
    components: { SetErrorOnSubmitComponent },
    template: "<SetErrorOnSubmitComponent />"
  })
}

export const DialogBlockingExamples: Story = {
  render: () => ({
    components: { DialogBlockingExamplesComponent },
    template: "<DialogBlockingExamplesComponent />"
  })
}

export const WindowExitPrevention: Story = {
  render: () => ({
    components: { WindowExitPreventionComponent },
    template: "<WindowExitPreventionComponent />"
  })
}

export const CustomInputClassName: Story = {
  render: () => ({
    components: { CustomInputClassNameComponent },
    template: "<CustomInputClassNameComponent />"
  })
}
