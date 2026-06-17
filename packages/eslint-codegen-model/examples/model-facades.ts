import { Effect } from "effect"
import * as S from "../../effect-app/src/Schema.js"

export interface CatalogDecodingServices {
  readonly CatalogDecodingServices: "CatalogDecodingServices"
}

export interface CatalogEncodingServices {
  readonly CatalogEncodingServices: "CatalogEncodingServices"
}

const ServiceAwareSku = S.NonEmptyString255.pipe(
  S.middlewareDecoding((effect) => Effect.context<CatalogDecodingServices>().pipe(Effect.flatMap(() => effect))),
  S.middlewareEncoding((effect) => Effect.context<CatalogEncodingServices>().pipe(Effect.flatMap(() => effect)))
)

class _CatalogItem extends S.Opaque<_CatalogItem>()(
  S.Struct({
    id: S.StringId,
    sku: ServiceAwareSku,
    name: S.NonEmptyString255,
    dimensions: S.Struct({
      width: S.Number,
      height: S.Number,
      depth: S.Number,
      unit: S.Literals(["cm", "in"])
    }),
    tags: S.Array(S.NonEmptyString255),
    attributes: S.Record(S.String, S.Union([S.String, S.Number, S.Boolean])),
    discontinuedAt: S.NullOr(S.DateFromString)
  })
) {}

// codegen:start {preset: modelFacade, className: _CatalogItem, schema: S}
// eslint-disable-next-line typescript/no-unsafe-declaration-merging
export class CatalogItem
  extends S.OpaqueFacade<
    CatalogItem,
    CatalogItem.Encoded,
    CatalogItem.Make,
    CatalogItem.DecodingServices,
    CatalogItem.EncodingServices
  >()(_CatalogItem)
{}
// codegen:end

class _OrderLine extends S.Opaque<_OrderLine>()(
  S.Struct({
    item: CatalogItem,
    quantity: S.Int,
    unitPrice: S.Struct({
      amount: S.Number,
      currency: S.Literals(["EUR", "USD", "GBP"])
    }),
    adjustments: S.Array(
      S.Struct({
        code: S.String,
        amount: S.Number,
        reason: S.optional(S.String)
      })
    )
  })
) {
  static defaultCurrency(): "EUR" {
    return "EUR"
  }
}

// codegen:start {preset: modelFacade, className: _OrderLine, schema: S}
// eslint-disable-next-line typescript/no-unsafe-declaration-merging
export class OrderLine
  extends S.OpaqueFacade<
    OrderLine,
    OrderLine.Encoded,
    OrderLine.Make,
    OrderLine.DecodingServices,
    OrderLine.EncodingServices
  >()(_OrderLine)
{}
// codegen:end

export const defaultOrderCurrency: "EUR" = OrderLine.defaultCurrency()

class _OrderAggregate extends S.Opaque<_OrderAggregate>()(
  S.Struct({
    id: S.StringId,
    customer: S.Struct({
      id: S.StringId,
      email: S.NonEmptyString255,
      profile: S.Struct({
        displayName: S.NonEmptyString255,
        phone: S.NullOr(S.String),
        address: S.Struct({
          line1: S.NonEmptyString255,
          line2: S.optional(S.NonEmptyString255),
          postalCode: S.NonEmptyString255,
          city: S.NonEmptyString255,
          country: S.NonEmptyString255
        })
      })
    }),
    lines: S.NonEmptyArray(OrderLine),
    fulfillment: S.Union([
      S.TaggedStruct("Pending", {
        requestedAt: S.DateFromString
      }),
      S.TaggedStruct("Packed", {
        packedAt: S.DateFromString,
        packageIds: S.NonEmptyArray(S.StringId)
      }),
      S.TaggedStruct("Shipped", {
        shippedAt: S.DateFromString,
        carrier: S.NonEmptyString255,
        trackingNumber: S.NonEmptyString255
      })
    ]),
    audit: S.Array(
      S.Struct({
        at: S.DateFromString,
        actorId: S.StringId,
        message: S.String,
        metadata: S.Record(S.String, S.String)
      })
    )
  })
) {}

// codegen:start {preset: modelFacade, className: _OrderAggregate, schema: S}
// eslint-disable-next-line typescript/no-unsafe-declaration-merging
export class OrderAggregate
  extends S.OpaqueFacade<
    OrderAggregate,
    OrderAggregate.Encoded,
    OrderAggregate.Make,
    OrderAggregate.DecodingServices,
    OrderAggregate.EncodingServices
  >()(_OrderAggregate)
{}
// codegen:end

// codegen:start {preset: model, static: true, facade: true}
//
export interface CatalogItem {
  readonly id: S.StringId
  readonly sku: S.NonEmptyString255
  readonly name: S.NonEmptyString255
  readonly dimensions: {
    readonly width: number
    readonly height: number
    readonly depth: number
    readonly unit: "cm" | "in"
  }
  readonly tags: readonly S.NonEmptyString255[]
  readonly attributes: { readonly [x: string]: string | number | boolean }
  readonly discontinuedAt: null | Date
}
export namespace CatalogItem {
  export interface Encoded {
    readonly id: string
    readonly sku: string
    readonly name: string
    readonly dimensions: {
      readonly width: number
      readonly height: number
      readonly depth: number
      readonly unit: "cm" | "in"
    }
    readonly tags: readonly string[]
    readonly attributes: { readonly [x: string]: string | number | boolean }
    readonly discontinuedAt: null | string
  }
  export interface Make {
    readonly id: S.StringId
    readonly sku: S.NonEmptyString255
    readonly name: S.NonEmptyString255
    readonly dimensions: {
      readonly width: number
      readonly height: number
      readonly depth: number
      readonly unit: "cm" | "in"
    }
    readonly tags: readonly S.NonEmptyString255[]
    readonly attributes: { readonly [x: string]: string | number | boolean }
    readonly discontinuedAt: null | Date
  }
  export type DecodingServices = CatalogDecodingServices
  export type EncodingServices = CatalogEncodingServices
}
export interface OrderLine {
  readonly item: CatalogItem
  readonly quantity: S.Int
  readonly unitPrice: { readonly amount: number; readonly currency: "EUR" | "USD" | "GBP" }
  readonly adjustments:
    readonly ({ readonly code: string; readonly amount: number; readonly reason?: undefined | string })[]
}
export namespace OrderLine {
  export interface Encoded {
    readonly item: CatalogItem.Encoded
    readonly quantity: number
    readonly unitPrice: { readonly amount: number; readonly currency: "EUR" | "USD" | "GBP" }
    readonly adjustments:
      readonly ({ readonly code: string; readonly amount: number; readonly reason?: undefined | string })[]
  }
  export interface Make {
    readonly item: CatalogItem.Make
    readonly quantity: S.Int
    readonly unitPrice: { readonly amount: number; readonly currency: "EUR" | "USD" | "GBP" }
    readonly adjustments:
      readonly ({ readonly code: string; readonly amount: number; readonly reason?: undefined | string })[]
  }
  export type DecodingServices = CatalogDecodingServices
  export type EncodingServices = CatalogEncodingServices
}
export interface OrderAggregate {
  readonly id: S.StringId
  readonly customer: {
    readonly id: S.StringId
    readonly email: S.NonEmptyString255
    readonly profile: {
      readonly displayName: S.NonEmptyString255
      readonly phone: null | string
      readonly address: {
        readonly line1: S.NonEmptyString255
        readonly postalCode: S.NonEmptyString255
        readonly city: S.NonEmptyString255
        readonly country: S.NonEmptyString255
        readonly line2?: undefined | S.NonEmptyString255
      }
    }
  }
  readonly lines: readonly [OrderLine, ...OrderLine[]]
  readonly fulfillment: { readonly _tag: "Pending"; readonly requestedAt: Date } | {
    readonly _tag: "Packed"
    readonly packedAt: Date
    readonly packageIds: readonly [S.StringId, ...S.StringId[]]
  } | {
    readonly _tag: "Shipped"
    readonly shippedAt: Date
    readonly carrier: S.NonEmptyString255
    readonly trackingNumber: S.NonEmptyString255
  }
  readonly audit: readonly {
    readonly at: Date
    readonly actorId: S.StringId
    readonly message: string
    readonly metadata: { readonly [x: string]: string }
  }[]
}
export namespace OrderAggregate {
  export interface Encoded {
    readonly id: string
    readonly customer: {
      readonly id: string
      readonly email: string
      readonly profile: {
        readonly displayName: string
        readonly phone: null | string
        readonly address: {
          readonly line1: string
          readonly postalCode: string
          readonly city: string
          readonly country: string
          readonly line2?: undefined | string
        }
      }
    }
    readonly lines: readonly [OrderLine.Encoded, ...OrderLine.Encoded[]]
    readonly fulfillment: { readonly _tag: "Pending"; readonly requestedAt: string } | {
      readonly _tag: "Packed"
      readonly packedAt: string
      readonly packageIds: readonly [string, ...string[]]
    } | {
      readonly _tag: "Shipped"
      readonly shippedAt: string
      readonly carrier: string
      readonly trackingNumber: string
    }
    readonly audit: readonly {
      readonly at: string
      readonly actorId: string
      readonly message: string
      readonly metadata: { readonly [x: string]: string }
    }[]
  }
  export interface Make {
    readonly id: S.StringId
    readonly customer: {
      readonly id: S.StringId
      readonly email: S.NonEmptyString255
      readonly profile: {
        readonly displayName: S.NonEmptyString255
        readonly phone: null | string
        readonly address: {
          readonly line1: S.NonEmptyString255
          readonly postalCode: S.NonEmptyString255
          readonly city: S.NonEmptyString255
          readonly country: S.NonEmptyString255
          readonly line2?: undefined | S.NonEmptyString255
        }
      }
    }
    readonly lines: readonly [OrderLine.Make, ...OrderLine.Make[]]
    readonly fulfillment: { readonly _tag: "Pending"; readonly requestedAt: Date } | {
      readonly _tag: "Packed"
      readonly packedAt: Date
      readonly packageIds: readonly [S.StringId, ...S.StringId[]]
    } | {
      readonly _tag: "Shipped"
      readonly shippedAt: Date
      readonly carrier: S.NonEmptyString255
      readonly trackingNumber: S.NonEmptyString255
    }
    readonly audit: readonly {
      readonly at: Date
      readonly actorId: S.StringId
      readonly message: string
      readonly metadata: { readonly [x: string]: string }
    }[]
  }
  export type DecodingServices = CatalogDecodingServices
  export type EncodingServices = CatalogEncodingServices
}
//
// codegen:end
