import { createIntl, type IntlFormatters } from "@formatjs/intl"
import * as JSONSchema from "effect/JSONSchema"
import type { ParseError } from "effect/ParseResult"
import type {} from "intl-messageformat"
import { Either, Option, pipe, S, Struct } from "effect-app"
import type { Schema } from "effect-app/Schema"
import type { Unbranded } from "effect-app/Schema/brand"
import type { IsUnion } from "effect-app/utils"
import type { Ref } from "vue"
import { capitalize, ref, watch } from "vue"

// type GetSchemaFromProp<T> = T extends Field<infer S, any, any, any> ? S
//   : never

function getTypeLiteralAST(ast: S.AST.AST): S.AST.TypeLiteral | null {
  switch (ast._tag) {
    case "TypeLiteral": {
      return ast
    }
    case "Transformation": {
      // this may be not correct for transformations from a type literal to something
      // that is not a type literal nor a class because we would prefer the from AST
      return getTypeLiteralAST(ast.to) ?? getTypeLiteralAST(ast.from)
    }
    default: {
      return null
    }
  }
}

export function convertIn(v: string | null, type?: "text" | "float" | "int") {
  return v === null ? "" : type === "text" ? v : `${v}`
}

export function convertOutInt(v: string, type?: "text" | "float" | "int") {
  v = v == null ? v : v.trim()
  const c = v === "" ? null : type === "float" ? parseFloat(v) : type === "int" ? parseInt(v) : v
  return c
}

export function convertOut(v: string, set: (v: unknown | null) => void, type?: "text" | "float" | "int") {
  return set(convertOutInt(v, type))
}

const f = Symbol()
export interface FieldInfo<Tout> extends PhantomTypeParameter<typeof f, { out: Tout }> {
  rules: ((v: string) => boolean | string)[]
  metadata: FieldMetadata
  type: "text" | "float" | "int" // todo; multi-line vs single line text
  _tag: "FieldInfo"
}

export interface UnionFieldInfo<T> {
  members: T
  _tag: "UnionFieldInfo"
}

export interface DiscriminatedUnionFieldInfo<T> {
  members: T
  _tag: "DiscriminatedUnionFieldInfo"
}

export type NestedFieldInfoKey<Key> = [Key] extends [Record<PropertyKey, any>]
  ? Unbranded<Key> extends Record<PropertyKey, any> ? NestedFieldInfo<Key>
  : FieldInfo<Key>
  : FieldInfo<Key>

export type DistributiveNestedFieldInfoKey<Key> = Key extends any ? NestedFieldInfoKey<Key> : never

export type NestedFieldInfo<To extends Record<PropertyKey, any>> = // exploit eventual _tag field to propagate the unique tag
  {
    fields: {
      [K in keyof To]-?: {
        "true": {
          "true": To[K] extends { "_tag": string } ? DiscriminatedUnionFieldInfo<
              { [P in DistributiveNestedFieldInfoKey<To[K]> as (P["_infoTag" & keyof P] & string)]: P }
            >
            : UnionFieldInfo<DistributiveNestedFieldInfoKey<To[K]>[]>
          "false": NestedFieldInfoKey<To[K]>
        }[`${To[K] extends object ? true : false}`]
        "false": NestedFieldInfoKey<To[K]>
      }[`${IsUnion<To[K]>}`]
    }
    _tag: "NestedFieldInfo"
    _infoTag: To extends { "_tag": string } ? To["_tag"] : undefined
  }

function handlePropertySignature(
  propertySignature: S.AST.PropertySignature
):
  | NestedFieldInfo<Record<PropertyKey, any>>
  | FieldInfo<any>
  | UnionFieldInfo<(NestedFieldInfo<Record<PropertyKey, any>> | FieldInfo<any>)[]>
  | DiscriminatedUnionFieldInfo<Record<PropertyKey, any>>
{
  const schema = S.make(propertySignature.type)

  switch (schema.ast._tag) {
    case "Transformation": {
      const tl = getTypeLiteralAST(schema.ast)

      return tl
        ? handlePropertySignature(
          new S.AST.PropertySignature(
            propertySignature.name,
            tl,
            propertySignature.isOptional,
            propertySignature.isReadonly,
            propertySignature.annotations
          )
        )
        : buildFieldInfo(propertySignature)
    }
    case "TypeLiteral": {
      return buildFieldInfoFromFieldsRoot(
        schema as S.Schema<Record<PropertyKey, any>, Record<PropertyKey, any>, never>
      )
    }
    case "Union": {
      const allTypeLiterals = schema.ast.types.every(getTypeLiteralAST)

      if (allTypeLiterals) {
        const members = schema
          .ast
          .types
          .map((elAst) =>
            // syntehtic property signature as if each union member were the only member
            new S.AST.PropertySignature(
              propertySignature.name,
              elAst,
              propertySignature.isOptional,
              propertySignature.isReadonly,
              propertySignature.annotations
            )
          )
          .flatMap((ps) => {
            // try to retrieve the _tag literal to set _infoTag later
            const typeLiteral = getTypeLiteralAST(ps.type)

            const tagPropertySignature = typeLiteral?.propertySignatures.find((_) => _.name === "_tag")
            const tagLiteral = tagPropertySignature
                && S.AST.isLiteral(tagPropertySignature.type)
                && typeof tagPropertySignature.type.literal === "string"
              ? tagPropertySignature.type.literal
              : void 0

            const toRet = handlePropertySignature(ps)

            if (toRet._tag === "UnionFieldInfo") {
              return toRet.members
            } else if (toRet._tag === "NestedFieldInfo") {
              return [{ ...toRet, _infoTag: tagLiteral as never }]
            } else if (toRet._tag === "DiscriminatedUnionFieldInfo") {
              return Object.values(toRet.members) as (NestedFieldInfo<Record<PropertyKey, any>> | FieldInfo<any>)[]
            } else {
              return [toRet]
            }
          })

        // support only _tag as discriminating key and it has to be a string
        const isDiscriminatedUnion = members.every((_) => _._tag === "NestedFieldInfo" && _._infoTag !== undefined)

        if (isDiscriminatedUnion) {
          return {
            members: members.reduce((acc, cur) => {
              // see the definiton of isDiscriminatedUnion
              const tag = (cur as NestedFieldInfo<Record<PropertyKey, any>>)._infoTag as unknown as string
              acc[tag] = cur
              return acc
            }, {} as Record<string, NestedFieldInfo<Record<PropertyKey, any>> | FieldInfo<any>>),
            _tag: "DiscriminatedUnionFieldInfo"
          }
        } else {
          return { members, _tag: "UnionFieldInfo" }
        }
      } else {
        return buildFieldInfo(propertySignature)
      }
    }

    default: {
      return buildFieldInfo(propertySignature)
    }
  }
}

export function buildFieldInfoFromFields<
  From extends Record<PropertyKey, any>,
  To extends Record<PropertyKey, any>
>(
  schema: Schema<To, From, never> & { fields?: S.Struct.Fields }
) {
  return buildFieldInfoFromFieldsRoot(schema).fields
}

export function buildFieldInfoFromFieldsRoot<
  From extends Record<PropertyKey, any>,
  To extends Record<PropertyKey, any>,
  R
>(
  schema: Schema<To, From, R> & { fields?: S.Struct.Fields }
): NestedFieldInfo<To> {
  const ast = getTypeLiteralAST(schema.ast)

  if (!ast) throw new Error("not a struct type")
  return ast.propertySignatures.reduce(
    (acc, cur) => {
      ;(acc.fields as any)[cur.name] = handlePropertySignature(cur)

      return acc
    },
    { _tag: "NestedFieldInfo", fields: {} } as NestedFieldInfo<To>
  )
}

export interface FieldMetadata {
  minLength: number | undefined
  maxLength: number | undefined
  required: boolean
}

abstract class PhantomTypeParameter<
  Identifier extends keyof any,
  InstantiatedType
> {
  protected abstract readonly _: {
    readonly [NameP in Identifier]: (_: InstantiatedType) => InstantiatedType
  }
}

const defaultIntl = createIntl({ locale: "en" })

export const translate = ref<IntlFormatters["formatMessage"]>(defaultIntl.formatMessage)
export const customSchemaErrors = ref<Map<S.AST.AST | string, (message: string, e: unknown, v: unknown) => string>>(
  new Map()
)

function buildFieldInfo(
  property: S.AST.PropertySignature
): FieldInfo<any> {
  const propertyKey = property.name
  const schema = S.make<unknown, unknown, never>(property.type)
  const metadata = getMetadataFromSchema(property.type) // TODO
  const parse = S.decodeUnknownEither(schema)

  const nullableOrUndefined = S.AST.isUnion(property.type)
    && (property.type.types.includes(S.Null.ast) || property.type.types.some((_) => _._tag === "UndefinedKeyword"))
  const realSelf = nullableOrUndefined && S.AST.isUnion(property.type)
    ? property.type.types.filter((_) => _ !== S.Null.ast && _._tag !== "UndefinedKeyword")[0]!
    : property.type
  const id = S.AST.getIdentifierAnnotation(property.type)
  const id2 = S.AST.getIdentifierAnnotation(realSelf)

  function renderError(e: ParseError, v: unknown) {
    const err = e.toString()

    const custom = customSchemaErrors.value.get(property.type)
      ?? customSchemaErrors.value.get(realSelf)
      ?? (Option.isSome(id) ? customSchemaErrors.value.get(id.value) : undefined)
      ?? (Option.isSome(id2) ? customSchemaErrors.value.get(id2.value) : undefined)

    return custom ? custom(err, e, v) : translate.value(
      { defaultMessage: "The entered value is not a valid {type}: {message}", id: "validation.not_a_valid" },
      {
        type: translate.value({
          defaultMessage: capitalize(propertyKey.toString()),
          id: `fieldNames.${String(propertyKey)}`
        }),
        message: metadata.description ? "expected " + metadata.description : err.slice(err.indexOf("Expected")) // TODO: this is not translated.
      }
    )
  }

  const stringRules = [
    (v: string | null) =>
      v === null
      || metadata.minLength === undefined
      || v.length >= metadata.minLength
      || translate.value({
        defaultMessage: "The field requires at least {minLength} characters",
        id: "validation.string.minLength"
      }, {
        minLength: metadata.minLength
      }),
    (v: string | null) =>
      v === null
      || metadata.maxLength === undefined
      || v.length <= metadata.maxLength
      || translate.value({
        defaultMessage: "The field cannot have more than {maxLength} characters",
        id: "validation.string.maxLength"
      }, {
        maxLength: metadata.maxLength
      })
  ]

  const numberRules = [
    (v: number | null) =>
      v === null
      || (metadata.minimum === undefined && metadata.exclusiveMinimum === undefined)
      || metadata.exclusiveMinimum !== undefined && v > metadata.exclusiveMinimum
      || metadata.minimum !== undefined && v >= metadata.minimum
      || translate.value({
        defaultMessage: "The value should be {isExclusive, select, true {larger than} other {at least}} {minimum}",
        id: "validation.number.min"
      }, {
        isExclusive: metadata.exclusiveMinimum !== undefined,
        minimum: metadata.exclusiveMinimum ?? metadata.minimum
      }),
    (v: number | null) =>
      v === null
      || (metadata.maximum === undefined && metadata.exclusiveMaximum === undefined)
      || metadata.exclusiveMaximum !== undefined && v < metadata.exclusiveMaximum
      || metadata.maximum !== undefined && v <= metadata.maximum
      || translate.value({
        defaultMessage: "The value should be {isExclusive, select, true {smaller than} other {at most}} {maximum}",
        id: "validation.number.max"
      }, {
        isExclusive: metadata.exclusiveMaximum !== undefined,
        maximum: metadata.exclusiveMaximum ?? metadata.maximum
      })
  ]

  const parseRule = (v: unknown) =>
    pipe(
      parse(v),
      Either.match({
        onLeft: (_) => renderError(_, v),
        onRight: () => true
      })
    )

  type UnknownRule = (v: unknown) => boolean | string
  const rules: UnknownRule[] = [
    ...(metadata.type === "text"
      ? stringRules
      : metadata.type === "float" || metadata.type === "int"
      ? numberRules
      : []) as UnknownRule[],
    parseRule as UnknownRule
  ]

  const info = {
    type: metadata.type,
    rules: [
      (v: string) =>
        !metadata.required
        || v !== ""
        || translate.value({ defaultMessage: "The field cannot be empty", id: "validation.empty" }),
      (v: string) => {
        const converted = convertOutInt(v, metadata.type)

        for (const r of rules) {
          const res = r(converted)
          if (res !== true) {
            return res
          }
        }

        return true
      }
    ],
    metadata,
    _tag: "FieldInfo"
  }

  return info as any
}

export const buildFormFromSchema = <
  From extends Record<PropertyKey, any>,
  To extends Record<PropertyKey, any>,
  C extends Record<PropertyKey, any>,
  OnSubmitA
>(
  s:
    & Schema<
      To,
      From,
      never
    >
    & { new(c: C): any; extend: any; fields: S.Struct.Fields },
  state: Ref<Omit<From, "_tag">>,
  onSubmit: (a: To) => Promise<OnSubmitA>
) => {
  const fields = buildFieldInfoFromFieldsRoot(s).fields
  const parse = S.decodeUnknownSync<any, any>(S.Struct(Struct.omit(s.fields, "_tag")) as any)
  const isDirty = ref(false)
  const isValid = ref(true)

  const submit1 = <A>(onSubmit: (a: To) => Promise<A>) => async <T extends Promise<{ valid: boolean }>>(e: T) => {
    const r = await e
    if (!r.valid) return
    return onSubmit(new s(parse(state.value)))
  }
  const submit = submit1(onSubmit)

  watch(
    state,
    (v) => {
      // TODO: do better
      isDirty.value = JSON.stringify(v) !== JSON.stringify(state.value)
    },
    { deep: true }
  )

  const submitFromState = () => submit(Promise.resolve({ valid: isValid.value }))

  return {
    fields,
    /** optimized for Vuetify v-form submit callback */
    submit,
    /** optimized for Native form submit callback or general use */
    submitFromState,
    isDirty,
    isValid
  }
}

export function getMetadataFromSchema(
  ast: S.AST.AST
): {
  type: "int" | "float" | "text"
  minimum?: number
  maximum?: number
  exclusiveMinimum?: number
  exclusiveMaximum?: number
  minLength?: number
  maxLength?: number
  required: boolean
  description?: string
} {
  const nullable = S.AST.isUnion(ast) && ast.types.includes(S.Null.ast)
  const realSelf = nullable && S.AST.isUnion(ast)
    ? ast.types.filter((_) => _ !== S.Null.ast)[0]!
    : ast

  let jschema: any
  try {
    jschema = JSONSchema.make(S.make(realSelf)) as any
  } catch (err) {
    jschema = {}
    // console.warn("error getting jsonschema from ", err, ast)
  }
  while (jschema["$ref"] && jschema["$ref"].startsWith("#/$defs/")) {
    const { $ref: _, ...rest } = jschema
    jschema = { ...jschema["$defs"][jschema["$ref"].replace("#/$defs/", "")], ...rest }
  }
  // or we need to add these info directly in the refinement like the minimum
  // or find a jsonschema parser whojoins all of them
  // todo, we have to use $ref: "#/$defs/Int"
  // and look up
  //   $defs: {
  //     "Int": {
  //         "type": "integer", <--- integer!!
  //         "description": "an integer",
  //         "title": "Int"
  //     }
  // }
  const isNumber = jschema.type === "number" || jschema.type === "integer"
  const isInt = jschema.type === "integer"
  return {
    type: isInt ? "int" as const : isNumber ? "float" as const : "text" as const,
    minimum: jschema.minimum,
    exclusiveMinimum: jschema.exclusiveMinimum,
    maximum: jschema.maximum,
    exclusiveMaximum: jschema.exclusiveMaximum,
    minLength: jschema.minLength,
    maxLength: jschema.maxLength,
    description: jschema.description,
    required: !nullable
  }
}
