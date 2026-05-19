---
"@effect-app/eslint-codegen-model": minor
---

Add `importExtension` option to the `barrel` preset to control the file extension emitted on generated imports/exports (defaults to `.js`). Configurable per block, globally via the oxlint rule option `["error", { barrel: { importExtension: ".ts" } }]`, or via `codegen.config.json` (CLI also accepts `--config <path>`). Resolution order: preset default → global defaults → per-block options.
