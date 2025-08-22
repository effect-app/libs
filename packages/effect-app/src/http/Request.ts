import type { HttpClientResponse } from "@effect/platform/HttpClientResponse"
import * as Effect from "../Effect.js"
import * as Option from "../Option.js"
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

export const demandJson = (client: HttpClient.HttpClient) =>
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
