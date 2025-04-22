import { defineCustomElement } from "vue"
import { default as OmegaForm } from "./OmegaWrapper.vue"
import { default as OmegaInput } from "./OmegaInput.vue"
import { default as OmegaErrors } from "./OmegaErrors.vue"
import { default as OmegaAutoGen } from "./OmegaAutoGen.vue"

export * as OmegaErrorsContext from "./OmegaErrorsContext"
export * from "./OmegaFormStuff"
export { useOmegaForm } from "./useOmegaForm"
export { default } from "./OmegaWrapper.vue"

export { OmegaForm, OmegaInput, OmegaErrors, OmegaAutoGen }

const OmegaFormCE = defineCustomElement(OmegaForm)
const OmegaInputCE = defineCustomElement(OmegaInput)
const OmegaErrorsCE = defineCustomElement(OmegaErrors)
const OmegaAutoGenCE = defineCustomElement(OmegaAutoGen)

export { OmegaFormCE, OmegaInputCE, OmegaErrorsCE, OmegaAutoGenCE }

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
  if (!customElements.get("omega-auto-gen")) {
    customElements.define("omega-auto-gen", OmegaAutoGenCE)
  }
}
