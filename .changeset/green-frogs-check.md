---
"effect-app": patch
---

Fix request handler input classification to use request schema fields instead of `make` parameters, preventing defaulted/nullable input fields from being treated as no-input handlers.
