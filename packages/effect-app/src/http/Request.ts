/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import type { HttpClientResponse } from "@effect/platform/HttpClientResponse"
import * as Effect from "../Effect.js"
import { HttpClient, HttpClientError, HttpClientRequest, HttpHeaders } from "./internal/lib.js"

export interface ResponseWithBody<A> extends Pick<HttpClientResponse, "headers" | "status" | "remoteAddress"> {
  readonly body: A
}

// TODO: consider rebuilding the text/json helpers to use a cached effect
// https://discord.com/channels/795981131316985866/1098177242598756412/1168565257569046712

export const responseWithJsonBody = (
  response: HttpClientResponse
) =>
  (Effect.map as any)(response.json, (body: unknown): ResponseWithBody<unknown> => ({
    body,
    headers: response.headers,
    status: response.status,
    remoteAddress: response.remoteAddress
  }))

export const demandJson = (client: HttpClient.HttpClient) =>
  HttpClient
    .mapRequest(client, (_) => HttpClientRequest.acceptJson(_))
    .pipe(HttpClient.transform((r: any, request: any) =>
      (Effect.tap as any)(r, (response: any) =>
        (HttpHeaders
            .get(response.headers, "Content-Type"))
            ?.startsWith("application/json")
          ? Effect.void
          : Effect.fail(
            new HttpClientError.DecodeError({
              request,
              response,
              description: "not json response: "
                + HttpHeaders.get(response.headers, "Content-Type")
            })
          ))
    )) as any
