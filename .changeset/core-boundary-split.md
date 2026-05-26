---
"effect-app": minor
"@effect-app/infra": major
"@effect-app/vue": minor
---

Move core service contracts and runtime-agnostic modules into `effect-app`, keep `infra` and `vue` focused on adapters, and drop the temporary `infra` compatibility re-export paths in favor of the new canonical imports.
