---
"@effect-app/infra": patch
---

Store JSON lowering is lenient on decode; `jitM` migrations run after the store boundary.

Document stores (Memory, Disk, SQL, Cosmos) decoded every stored document with the full schema on read, so a legacy-shaped document that relies on the repository's `jitM` to add a missing key failed with `Missing key` before `jitM` ever saw it. Decode now walks the stored document's own keys and only lifts JSON to native Encoded values (Date/Map/Set and app-native declarations); missing keys stay absent, refinements and checks are not enforced, and an unparseable leaf passes through unchanged. The repository's own decode, after `jitM`, still validates the whole document. Writes keep using the strict whole-document codec.
