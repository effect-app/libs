import mitt from "mitt"
import { inject, type InjectionKey, provide, type Ref } from "vue"
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
  const isDirty = mkIsDirty()
  onMountedWithCleanup(() => {
    const onDialogClosing = (evt: DialogClosing) => {
      if (isDirty.value) {
        if (!confirm("Es sind ungespeicherte Änderungen vorhanden. Wirklich schließen?")) {
          evt.prevent = true
        }
      }
    }
    bus.on("dialog-closing", onDialogClosing)

    return () => bus.off("dialog-closing", onDialogClosing)
  })
}

export const useOnClose = (close: () => void) => {
  const bus = provideBus()
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
