---
"@effect-app/infra": minor
---

Standardize span attributes on OpenTelemetry semantic conventions.

All Store adapters (Cosmos, PostgreSQL, SQLite, Memory, Disk) and Queue adapters
(Service Bus, SQL, Memory) now emit OTel-compliant span names and attributes via
the new `@effect-app/infra/otel` helper module.

Span name convention: `<operation> <collection|destination>` (low cardinality).

Attribute key migration:

| Old                                                 | New                                                                               |
| --------------------------------------------------- | --------------------------------------------------------------------------------- |
| `repository.table_name` / `repository.container_id` | `db.collection.name`                                                              |
| `repository.namespace`                              | `db.namespace`                                                                    |
| `repository.model_name` / `itemType`                | `app.entity`                                                                      |
| `id` / `itemId` (entity span attr)                  | `app.entity.id`                                                                   |
| `itemIds`                                           | `app.entity.ids`                                                                  |
| `db.cosmos.request_charge`                          | `azure.cosmosdb.operation.request_charge`                                         |
| `db.cosmos.resource_count`                          | `db.response.returned_rows`                                                       |
| `db.cosmos.response_bytes`                          | `db.response.body.size`                                                           |
| `disk.file` / `disk.file_size`                      | `disk.file.path` / `disk.file.size`                                               |
| `queue.name`                                        | `messaging.destination.name`                                                      |
| `queue.sessionId`                                   | `messaging.message.conversation_id`                                               |
| `queue.type`                                        | `messaging.system`                                                                |
| `queue.input` (full body)                           | `messaging.message.body` (+ `messaging.message.id`, `messaging.message.type`)     |
| `message_tags`                                      | `messaging.message.types` + `messaging.batch.message_count`                       |
| `request.name`                                      | `code.function.name` (from `spanAttributes`) / `rpc.method` (middleware)          |
| `request.locale`                                    | `app.locale`                                                                      |
| `request.namespace`                                 | `app.tenant.id`                                                                   |
| `request.source.id`                                 | `client.id`                                                                       |
| `request.user.sub` / `.roles`                       | `user.id` / `user.roles`                                                          |
| `requestInput`                                      | `rpc.request.payload`                                                             |
| `connectionId`                                      | `network.connection.id`                                                           |
| Span `Request.<module>.<method>`                    | Span `<module>/<method>` + `rpc.system`/`rpc.service`/`rpc.method` (kind: server) |
| `<spanPrefix>.<op>` (SQL/Model)                     | OTel db span via `withDbSpan`, with `dbSystem?` option                            |

New attributes added:

- `db.system.name` — e.g. `postgresql`, `sqlite`, `cosmosdb`, `memory`, `disk`
- `db.operation.name` — e.g. `find`, `all`, `filter`, `set`
- `db.query.text` — sanitized / parameterized SQL or Cosmos query (no bound values)
- `messaging.operation.name` — `publish`, `process`, `receive`

Breaking: dashboards/alerts keying on the previous attribute names must be
updated. Queue consumer spans no longer log raw message bodies — use
`messaging.message.id` and `messaging.message.type` instead.
