import type { Annotation } from "../_schema.js"
import * as MO from "../_schema.js"
import { named } from "../_schema.js"
import * as Arbitrary from "../Arbitrary.js"
import * as Constructor from "../Constructor.js"
import * as Encoder from "../Encoder.js"
import * as Guard from "../Guard.js"
import * as Parser from "../Parser.js"
import * as S from "./schemed.js"

export type SchemaForModel<M, Self extends MO.SchemaAny> = MO.Schema<
  MO.ParserInputOf<Self>,
  M,
  MO.ConstructorInputOf<Self>,
  MO.From<Self>,
  MO.ApiOf<Self> & MO.ApiSelfType<M>
>

export type ParserFor<Self extends MO.SchemaAny> = Parser.Parser<
  MO.ParserInputOf<Self>,
  MO.ParserErrorOf<Self>,
  MO.To<Self>
>

export type ConstructorFor<Self extends MO.SchemaAny> = Constructor.Constructor<
  MO.ConstructorInputOf<Self>,
  MO.To<Self>,
  MO.ConstructorErrorOf<Self>
>

export type EncoderFor<Self extends MO.SchemaAny> = Encoder.Encoder<
  MO.To<Self>,
  MO.From<Self>
>

export type GuardFor<Self extends MO.SchemaAny> = Guard.Guard<MO.To<Self>>

export type ArbitraryFor<Self extends MO.SchemaAny> = Arbitrary.Gen<
  MO.To<Self>
>

export type ModelFor<M, Self extends MO.SchemaAny> = M extends MO.To<Self> ? SchemaForModel<M, Self>
  : SchemaForModel<MO.To<Self>, Self>

export interface Class<M, Self extends MO.SchemaAny> extends
  S.Schemed<Self>,
  MO.Schema<
    MO.ParserInputOf<Self>,
    M,
    MO.ConstructorInputOf<Self>,
    MO.From<Self>,
    MO.ApiOf<Self>
  >
{
  [S.schemaField]: Self

  readonly Parser: ParserFor<SchemaForModel<M, Self>>

  readonly Constructor: ConstructorFor<SchemaForModel<M, Self>>

  readonly Encoder: EncoderFor<SchemaForModel<M, Self>>

  readonly Guard: GuardFor<SchemaForModel<M, Self>>

  readonly Arbitrary: ArbitraryFor<SchemaForModel<M, Self>>
}

/**
 * @inject genericName
 */
export function Class<M>(__name?: string) {
  return <Self extends MO.SchemaAny>(self: Self): Class<M, Self> => {
    const schemed = S.Schemed(named(__name ?? "Class(Anonymous)")(self))
    const schema = S.schema(schemed)

    Object.defineProperty(schemed, MO.SchemaContinuationSymbol, {
      value: schema
    })

    Object.defineProperty(schemed, "Api", {
      get() {
        return self.Api
      }
    })

    Object.defineProperty(schemed, ">>>", {
      value: self[">>>"]
    })

    Object.defineProperty(schemed, "Parser", {
      value: Parser.for(schema)
    })

    Object.defineProperty(schemed, "Constructor", {
      value: Constructor.for(schema)
    })

    Object.defineProperty(schemed, "Encoder", {
      value: Encoder.for(schema)
    })

    Object.defineProperty(schemed, "Guard", {
      value: Guard.for(schema)
    })

    Object.defineProperty(schemed, "Arbitrary", {
      value: Arbitrary.for(schema)
    })

    Object.defineProperty(schemed, "annotate", {
      value: <Meta>(identifier: Annotation<Meta>, meta: Meta) => new MO.SchemaAnnotated(schema, identifier, meta)
    })

    // @ts-expect-error the following is correct
    return schemed
  }
}
