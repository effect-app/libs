---
"@effect-app/infra": patch
---

Fix Cosmos `projectComputed` parameter index shift when `relation(...).every(...)` is present. The shared filter `print` was invoked twice per `relation-every` (once eagerly for the `where` variable, again inside the `NOT EXISTS(... WHERE NOT (...))` branch), bumping the outer `@v` counter beyond the bound parameter array and producing SQL that referenced unbound placeholders — queries returned 0 rows on Cosmos while SQLite/Memory adapters were unaffected.
