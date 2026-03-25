/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Effect, Option } from "effect"
import * as S from "effect-app/Schema"
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
          catch: (e: any) => new S.SchemaIssue.InvalidValue(Option.some(s), { message: e?.message })
        })
    )
    .pipe(S.decodeTo(schema) as any)
