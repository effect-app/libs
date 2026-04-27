import { createIntl, type IntlFormatters } from "@formatjs/intl"

import { Cause, Exit, Option, pipe, S } from "effect-app"
import type { Unbranded } from "effect-app/Schema/brand"
import type { IsUnion } from "effect-app/utils"
import { capitalize, ref } from "vue"

// type GetSchemaFromProp<T> = T extends Field<infer S, any, any, any> ? S
//   : never

function getObjectsAST(ast: S.AST.AST): S.AST.Objects | null {
  if (S.AST.isObjects(ast)) {
    return ast
  }
  if (S.AST.isDeclaration(ast)) {
    for (const typeParam of ast.typeParameters) {
      const result = getObjectsAST(typeParam)
      if (result) return result
    }
    return null
  }
  return null
}

/** @deprecated Use OmegaForm instead */
export function convertIn(v: string | null, type?: "text" | "float" | "int") {
  return v === null ? "" : type === "text" ? v : `${v}`
}

/**
 * Makes sure our international number format is converted to js int/float format.
 * Right now assumes . for thousands and , for decimal.
 */
/** @deprecated Use OmegaForm instead */
export const prepareNumberForLocale = (v: string) => v.replace(/\./g, "").replace(/,/g, ".")

/** @deprecated Use OmegaForm instead */
export function convertOutInt(v: string, type?: "text" | "float" | "int") {
  v = v == null ? v : v.trim()
  const c = v === ""
    ? null
    : type === "float"
    ? parseFloat(v)
    : type === "int"
    ? (() => {
      const asFloat = parseFloat(v)
      const asInt = parseInt(v)
      // if float and int differ, there's a decimal part - keep as float to fail integer validation
      return asFloat !== asInt ? asFloat : asInt
    })()
    : v
  return c
}

/** @deprecated Use OmegaForm instead */
export function convertOut(v: string, set: (v: {} | null) => void, type?: "text" | "float" | "int") {
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
  ? Unbranded<Key> extends (string | number | boolean | bigint | symbol) ? FieldInfo<Key>
  : Unbranded<Key> extends Record<PropertyKey, any> ? NestedFieldInfo<Key>
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

  if (S.AST.isDeclaration(schema.ast)) {
    const tl = getObjectsAST(schema.ast)
    return tl
      ? handlePropertySignature(
        new S.AST.PropertySignature(
          propertySignature.name,
          tl
        )
      )
      : buildFieldInfo(propertySignature)
  }

  switch (schema.ast._tag) {
    case "Objects": {
      return buildFieldInfoFromFieldsRoot(
        schema as S.Codec<Record<PropertyKey, any>>
      )
    }
    case "Union": {
      const allTypeLiterals = schema.ast.types.every(getObjectsAST)

      if (allTypeLiterals) {
        const members = schema
          .ast
          .types
          .map((elAst) =>
            // syntehtic property signature as if each union member were the only member
            new S.AST.PropertySignature(
              propertySignature.name,
              elAst
            )
          )
          .flatMap((ps) => {
            // try to retrieve the _tag literal to set _infoTag later
            const typeLiteral = getObjectsAST(ps.type)

            const tagPropertySignature = typeLiteral?.propertySignatures.find((_) => _.name === "_tag")
            // unwrap single-element Union to Literal (S.Struct({ _tag: S.Literal("x") }) wraps as Union([Literal("x")]))
            const tagType = tagPropertySignature
              ? S.AST.isUnion(tagPropertySignature.type)
                  && tagPropertySignature.type.types.length === 1
                  && S.AST.isLiteral(tagPropertySignature.type.types[0]!)
                ? tagPropertySignature.type.types[0]
                : tagPropertySignature.type
              : undefined
            const tagLiteral = tagType
                && S.AST.isLiteral(tagType)
                && typeof tagType.literal === "string"
              ? tagType.literal
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

/** @deprecated Use OmegaForm instead */
export function buildFieldInfoFromFields<
  From extends Record<PropertyKey, any>,
  To extends Record<PropertyKey, any>
>(
  schema: (S.Codec<To, From>) & { fields?: S.Struct.Fields }
) {
  return buildFieldInfoFromFieldsRoot(schema).fields
}

/** @deprecated Use OmegaForm instead */
export function buildFieldInfoFromFieldsRoot<
  From extends Record<PropertyKey, any>,
  To extends Record<PropertyKey, any>,
  R
>(
  schema: (S.Codec<To, From, R>) & { fields?: S.Struct.Fields }
): NestedFieldInfo<To> {
  const ast = getObjectsAST(schema.ast)

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

/** @deprecated Use OmegaForm instead */
export const translate = ref<IntlFormatters["formatMessage"]>(defaultIntl.formatMessage)
/** @deprecated Use OmegaForm instead */
export const customSchemaErrors = ref<Map<S.AST.AST | string, (message: string, e: unknown, v: unknown) => string>>(
  new Map()
)

function buildFieldInfo(
  property: S.AST.PropertySignature
): FieldInfo<any> {
  const propertyKey = property.name
  const schema = S.make<S.Codec<unknown>>(property.type)
  const metadata = getMetadataFromSchema(property.type)
  const parse = S.decodeUnknownExit(schema)

  const nullableOrUndefined = S.AST.isUnion(property.type)
    && (property.type.types.includes(S.Null.ast) || property.type.types.some((_) => _._tag === "Undefined"))
  const realSelf = nullableOrUndefined && S.AST.isUnion(property.type)
    ? property.type.types.find((_) => _ !== S.Null.ast && _._tag !== "Undefined")!
    : property.type
  const id = S.AST.resolveIdentifier(property.type)
  const id2 = S.AST.resolveIdentifier(realSelf)

  function renderError(e: S.SchemaError, v: unknown) {
    const err = e.toString()

    const custom = customSchemaErrors.value.get(property.type)
      ?? customSchemaErrors.value.get(realSelf)
      ?? (id ? customSchemaErrors.value.get(id) : undefined)
      ?? (id2 ? customSchemaErrors.value.get(id2) : undefined)

    if (custom) {
      return custom(err, e, v)
    }

    // parse specific error types for better translation support
    const integerMatch = err.match(/Expected.*integer.*(?:actual|got)\s+([^)]+)/i)
    if (integerMatch) {
      return translate.value(
        { defaultMessage: "Expected an integer, actual {actualValue}", id: "validation.integer.expected" },
        { actualValue: integerMatch[1] }
      )
    }

    const numberMatch = err.match(/Expected.*number.*(?:actual|got)\s+([^)]+)/i)
    if (numberMatch) {
      return translate.value(
        { defaultMessage: "Expected a number, actual {actualValue}", id: "validation.number.expected" },
        { actualValue: numberMatch[1] }
      )
    }

    // fallback to generic error message
    return translate.value(
      { defaultMessage: "The entered value is not a valid {type}: {message}", id: "validation.not_a_valid" },
      {
        type: translate.value({
          defaultMessage: capitalize(propertyKey.toString()),
          id: `fieldNames.${String(propertyKey)}`
        }),
        // TODO: not translated yet
        message: metadata.description ? "expected " + metadata.description : err.slice(err.indexOf("Expected"))
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
      Exit.match({
        onFailure: (cause) => {
          const err = Cause.findErrorOption(cause)
          return Option.isSome(err) ? renderError(err.value, v) : "Unknown error"
        },
        onSuccess: () => true
      })
    )

  type UnknownRule = (v: unknown) => boolean | string
  const rules: UnknownRule[] = [
    ...(metadata.type === "text"
      ? stringRules
      : metadata.type === "float" || metadata.type === "int"
      ? numberRules
      : []) as UnknownRule[],
    parseRule
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

/** @deprecated Use OmegaForm instead */
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
  const findJsonSchemaType = (
    schema: any,
    target: "number" | "integer"
  ): boolean => {
    if (!schema || typeof schema !== "object") {
      return false
    }

    if (schema.type === target) {
      return true
    }

    if (Array.isArray(schema.type) && schema.type.includes(target)) {
      return true
    }

    return ["anyOf", "oneOf", "allOf"].some((key) =>
      Array.isArray(schema[key]) && schema[key].some((member: any) => findJsonSchemaType(member, target))
    )
  }

  const nullable = S.AST.isUnion(ast) && ast.types.includes(S.Null.ast)
  const realSelf = nullable && S.AST.isUnion(ast)
    ? ast.types.find((_) => _ !== S.Null.ast)!
    : ast

  let jschema: any
  try {
    const doc = S.toJsonSchemaDocument(S.make<S.Codec<unknown>>(realSelf))
    jschema = doc.schema as any
    const defs = doc.definitions
    // resolve $ref against definitions
    while (jschema["$ref"] && jschema["$ref"].startsWith("#/$defs/")) {
      const { $ref: _, ...rest } = jschema
      jschema = { ...defs[jschema["$ref"].replace("#/$defs/", "")], ...rest }
    }
  } catch {
    jschema = {}
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
  const isInt = findJsonSchemaType(jschema, "integer")
  const isNumber = isInt || findJsonSchemaType(jschema, "number")
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
