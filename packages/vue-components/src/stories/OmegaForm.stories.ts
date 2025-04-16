import type { Meta, StoryObj } from "@storybook/vue3"
import { S } from "effect-app"
import { OmegaForm, OmegaInput, OmegaErrors } from "../components/OmegaForm"
import { provideIntl } from "../utils"
import { type makeIntl } from "@effect-app/vue"
import { ref } from "vue"

// Create a mock intl provider for Storybook
const mockIntl = {
  locale: ref("en"),
  trans: (id: string, values?: Record<string, any>) => id,
  intl: ref({ formatMessage: (msg: { id: string }, values?: any) => msg.id }),
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

export const SimpleForm: Story = {
  args: {
    schema: S.Struct({ asder2: S.String }),
    onSubmit: ({ value }: { value: { asder2: string } }) => {
      console.log(value)
    },
    subscribe: ["values"],
  },
  render: args => ({
    components: { OmegaForm, OmegaInput },
    setup() {
      return { args }
    },
    template: `
      <OmegaForm v-bind="args">
        <template #default="{ form, subscribedValues: { values } }">
          <div>values: {{ values }}</div>
          <OmegaInput label="asder2" name="asder2" :form="form">
            <template #default="inputProps">
              <label :for="inputProps.name">{{ inputProps.label }}</label>
              <input
                :id="inputProps.name"
                v-model="inputProps.field.state.value"
                :name="inputProps.name"
                style="border: 1px solid red"
                @change="(e) => inputProps.field.handleChange(e.target.value)"
              />
            </template>
          </OmegaInput>
          <button>submit</button>
        </template>
      </OmegaForm>
    `,
  }),
}

export const EmailForm: Story = {
  args: {
    schema: S.Struct({
      email: S.Email,
      confirm: S.Email,
    }).pipe(
      S.filter(
        form => {
          if (form.email !== form.confirm) {
            return false
          }
          return true
        },
        {
          message: () => "Email and confirmation must match",
          jsonSchema: {
            items: ["confirm"],
          },
        },
      ),
    ),
    defaultValues: {
      email: "mimmo@asd.it",
      confirm: "amerelli@asd.it",
    },
    onSubmit: ({ value }: { value: { email: string; confirm: string } }) => {
      console.log(value)
    },
  },
  render: args => ({
    components: { OmegaForm, OmegaInput, OmegaErrors },
    setup() {
      return { args }
    },
    template: `
      <OmegaForm v-bind="args">
        <template #default="{ form }">
          <OmegaInput label="email" name="email" :form="form" />
          <OmegaInput label="confirm" name="confirm" :form="form" />
          <button>submit</button>
          <OmegaErrors />
        </template>
      </OmegaForm>
    `,
  }),
}

export const ComplexForm: Story = {
  args: {
    schema: S.Struct({
      aString: S.String,
      aStringMin2: S.String.pipe(S.minLength(2)),
      aStringMin2Max4: S.String.pipe(S.minLength(2)).pipe(S.maxLength(4)),
      aStringMin2Max3Nullable: S.UndefinedOr(
        S.String.pipe(S.minLength(2)).pipe(S.maxLength(3)),
      ),
      aNumber: S.Number,
      aNumberMin2: S.Number.pipe(S.greaterThan(2)),
      aNumberMin2Max: S.Number.pipe(S.greaterThan(2)).pipe(S.lessThan(4)),
      aNumberMin2Max4Nullable: S.NullOr(S.Number.pipe(S.between(2, 4))),
      aSelect: S.Union(S.Literal("a"), S.Literal("b"), S.Literal("c")),
    }),
    onSubmit: ({
      value,
    }: {
      value: {
        aString: string
        aStringMin2: string
        aStringMin2Max4: string
        aStringMin2Max3Nullable?: string
        aNumber: number
        aNumberMin2: number
        aNumberMin2Max: number
        aNumberMin2Max4Nullable: number | null
        aSelect: "a" | "b" | "c"
      }
    }) => {
      console.log(value)
    },
  },
  render: args => ({
    components: { OmegaForm, OmegaInput },
    setup() {
      return { args }
    },
    template: `
      <OmegaForm v-bind="args">
        <template #default="{ form }">
          <OmegaInput label="aString" :form="form" name="aString" />
          <OmegaInput label="aStringMin2" :form="form" name="aStringMin2" />
          <OmegaInput label="aStringMin2Max4" :form="form" name="aStringMin2Max4" />
          <OmegaInput label="aStringMin2Max3Nullable" :form="form" name="aStringMin2Max3Nullable" />
          <OmegaInput label="aNumber" :form="form" name="aNumber" />
          <OmegaInput label="aNumberMin2" :form="form" name="aNumberMin2" />
          <OmegaInput label="aNumberMin2Max" :form="form" name="aNumberMin2Max" />
          <OmegaInput label="aNumberMin2Max4Nullable" :form="form" name="aNumberMin2Max4Nullable" />
          <OmegaInput
            label="aSelect"
            :form="form"
            name="aSelect"
            :options="[
              { title: 'a', value: 'a' },
              { title: 'b', value: 'b' },
              { title: 'c', value: 'c' },
            ]"
          />
          <button>Submit</button>
        </template>
      </OmegaForm>
    `,
  }),
}

export const UndefinedStringForm: Story = {
  args: {
    schema: S.Struct({ aString: S.UndefinedOr(S.String) }),
    subscribe: ["values"],
  },
  render: args => ({
    components: { OmegaForm, OmegaInput },
    setup() {
      return { args }
    },
    template: `
      <OmegaForm v-bind="args">
        <template #default="{ form, subscribedValues: { values } }">
          <OmegaInput label="aString" :form="form" name="aString" />
          <pre>{{ values }}</pre>
        </template>
      </OmegaForm>
    `,
  }),
}
