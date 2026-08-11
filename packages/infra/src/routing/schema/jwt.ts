/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as S from "effect-app/Schema"
import * as Effect from "effect/Effect"
import { jwtDecode, type JwtDecodeOptions } from "jwt-decode"

export const parseJwt = <Sch extends S.Top>(
  schema: Sch,
  options?: JwtDecodeOptions
) =>
  S
    .transformToOrFail(
      S.String,
      S.Unknown,
      (s, _options) =>
        Effect.try({
          try: () => jwtDecode(s, options),
          catch: (e: any) => new S.SchemaIssue.InvalidValue({ message: e?.message }, s)
        })
    )
    .pipe(S.decodeTo(schema) as any)
