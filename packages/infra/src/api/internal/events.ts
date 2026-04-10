import { Duration, Effect, pipe, S, Schedule, Stream } from "effect-app"
import { HttpHeaders, HttpServerResponse } from "effect-app/http"
import { reportError } from "../../errorReporter.js"
import { setupRequestContextFromCurrent } from "../setupRequest.js"

// Tell the client to retry every 10 seconds if connectivity is lost
const setRetry = Stream.succeed("retry: 10000")
const keepAlive = Stream.fromEffectSchedule(Effect.succeed(":keep-alive"), Schedule.fixed(Duration.seconds(15)))

let connId = BigInt(0)

export const makeSSE = <A extends { id: any }, SI, SRD, SRE>(
  schema: S.Codec<A, SI, SRD, SRE>
) =>
<E, R>(events: Stream.Stream<{ evt: A; namespace: string }, E, R>) =>
  Effect
    .gen(function*() {
      const id = connId++
      const ctx = yield* Effect.context<R | SR>()
      const res = HttpServerResponse.stream(
        // workaround for different scoped behaviour for streams in Bun
        // https://discord.com/channels/795981131316985866/1098177242598756412/1389646879675125861
        Effect
          .gen(function*() {
            yield* Effect.annotateCurrentSpan({ connectionId: id.toString() })
            yield* Effect.logInfo("$ start listening to events, id: " + id.toString())
            yield* Effect.addFinalizer(() => Effect.logInfo("$ end listening to events, id: " + id.toString()))

            const enc = new TextEncoder()

            const encode = S.encodeEffect(S.fromJsonString(S.toCodecJson(schema)))

            const eventStream = Stream.mapEffect(
              events,
              (_) =>
                encode(_.evt)
                  .pipe(Effect.map((data) => `id: ${_.evt.id}\ndata: ${data}`))
            )

            const stream = pipe(
              setRetry,
              Stream.merge(keepAlive),
              // Keep this unary so pipe receives a function, not a Stream value.
              (self) => Stream.merge(self, eventStream, { haltStrategy: "either" }),
              Stream.tapCause((cause) => Effect.logError("SSE error", cause)),
              Stream.map((_) => enc.encode(_ + "\n\n"))
            )

            return stream
          })
          .pipe(
            Stream.unwrap,
            Stream.tapCause(reportError("Request")),
            Stream.provide(ctx)
          ),
        {
          contentType: "text/event-stream",
          headers: HttpHeaders.fromInput({
            "content-type": "text/event-stream",
            "cache-control": "no-cache",
            "x-accel-buffering": "no",
            "connection": "keep-alive" // if (req.httpVersion !== "2.0")
          })
        }
      )
      return res
    })
    .pipe(Effect.tapCause(reportError("Request")), setupRequestContextFromCurrent("events"))
