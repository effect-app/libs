import mitt from "mitt"
import { inject, type InjectionKey, provide, type Ref } from "vue"
import { useIntl } from "../../utils"
import { onMountedWithCleanup } from "./onMountedWithCleanup"

export type DialogClosing = { prevent?: boolean | Promise<boolean> }
const makeBus = () => mitt<{ "dialog-closing": DialogClosing }>()

const Bus = Symbol("DialogBus") as InjectionKey<ReturnType<typeof makeBus>>

export const injectBus = () => inject(Bus, null)
export const provideBus = () => {
  const bus = makeBus()
  provide(Bus, bus)
  return bus
}

export const usePreventClose = (mkIsDirty: () => Ref<boolean>) => {
  const bus = injectBus()
  if (!bus) {
    return
  }
  const { formatMessage, trans } = useIntl()
  const isDirty = mkIsDirty()
  const defaultMessage = "There are unsaved changes. Are you sure you want to close?"
  onMountedWithCleanup(() => {
    const onDialogClosing = (evt: DialogClosing) => {
      if (isDirty.value) {
        // Mirror the guard pattern in errors.ts: a custom `useIntl` mock may
        // only provide `trans`, so fall back through trans → defaultMessage.
        const message = formatMessage
          ? formatMessage({ id: "form.unsaved_changes_confirm", defaultMessage })
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- key may not be registered in the locale catalog
          : trans?.("form.unsaved_changes_confirm" as any) ?? defaultMessage
        if (!confirm(message)) {
          evt.prevent = true
        }
      }
    }
    bus.on("dialog-closing", onDialogClosing)

    return () => bus.off("dialog-closing", onDialogClosing)
  })
}

export const useOnClose = (close: () => void) => {
  // Use existing bus if available, otherwise provide a new one
  let bus = injectBus()
  if (!bus) {
    bus = provideBus()
  }

  const onClose = () => {
    const evt: DialogClosing = {}
    bus.emit("dialog-closing", evt)
    if (evt.prevent) {
      if (typeof evt.prevent === "object" && "then" in evt.prevent) {
        evt.prevent.then((r) => {
          if (r !== false) {
            close()
          }
        })
      }
    } else {
      close()
    }
  }

  return onClose
}
