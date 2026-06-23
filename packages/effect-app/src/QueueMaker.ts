import { RequestContext } from "./RequestContext.ts"

/**
 * Per-message context envelope (tenant/store id, request metadata) carried
 * alongside message-schema payloads. Alias of {@link RequestContext}.
 *
 * All that remains of the former queue machinery (SB/SQLite/mem `QueueMaker`
 * implementations and the `QueueBase` interface) after the move to cluster
 * entities — the message schemas that embed it still reference this envelope.
 */
export const QueueMeta = RequestContext
