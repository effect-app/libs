import type { HttpClientResponse } from "@effect/platform/HttpClientResponse"
import { Effect, Option } from "../lib.js"
import { HttpClient, HttpClientError, HttpClientRequest, HttpHeaders } from "./internal/lib.js"

export interface ResponseWithBody<A> extends Pick<HttpClientResponse, "headers" | "status" | "remoteAddress"> {
  readonly body: A
}

// TODO: consider rebuilding the text/json helpers to use a cached effect
// https://discord.com/channels/795981131316985866/1098177242598756412/1168565257569046712

export const responseWithJsonBody = (
  response: HttpClientResponse
) =>
  Effect.map(response.json, (body): ResponseWithBody<unknown> => ({
    body,
    headers: response.headers,
    status: response.status,
    remoteAddress: response.remoteAddress
  }))

export const demandJson = <E, R>(client: HttpClient.HttpClient<E, R>) =>
  HttpClient
    .mapRequest(client, (_) => HttpClientRequest.acceptJson(_))
    .pipe(HttpClient.transform((r, request) =>
      Effect.tap(r, (response) =>
        Option
            .getOrUndefined(HttpHeaders
              .get(response.headers, "Content-Type"))
            ?.startsWith("application/json")
          ? Effect.void
          : Effect.fail(
            new HttpClientError.ResponseError({
              request,
              response,
              reason: "Decode",
              description: "not json response: "
                + Option.getOrUndefined(HttpHeaders.get(response.headers, "Content-Type"))
            })
          ))
    ))
