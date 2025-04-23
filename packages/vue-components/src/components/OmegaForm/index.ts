import { defineCustomElement } from "vue"
import { default as OmegaForm } from "./OmegaWrapper.vue"
import { default as OmegaInput } from "./OmegaInput.vue"
import { default as OmegaErrors } from "./OmegaErrors.vue"

export * as OmegaErrorsContext from "./OmegaErrorsContext"
export * from "./OmegaFormStuff"
export { useOmegaForm } from "./useOmegaForm"
export { default } from "./OmegaWrapper.vue"

export { OmegaForm, OmegaInput, OmegaErrors }

const OmegaFormCE = defineCustomElement(OmegaForm as any)
const OmegaInputCE = defineCustomElement(OmegaInput as any)
const OmegaErrorsCE = defineCustomElement(OmegaErrors as any)

export { OmegaFormCE, OmegaInputCE, OmegaErrorsCE }

export function registerOmegaForm() {
  if (!customElements.get("omega-form")) {
    customElements.define("omega-form", OmegaFormCE)
  }
  if (!customElements.get("omega-input")) {
    customElements.define("omega-input", OmegaInputCE)
  }
  if (!customElements.get("omega-errors")) {
    customElements.define("omega-errors", OmegaErrorsCE)
  }
}
