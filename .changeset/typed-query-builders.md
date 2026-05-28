---
"effect-app": minor
---

Tighten typing of query DSL builders so field/path parameters are constrained to actual field paths instead of bare `string`:

- `relation(path)` now infers the relation's element type and constrains `distinctCount`/`sum`/`collect`/`collectDistinct`/`collectFields`/`collectDistinctFields` and the `unit` of `sumExprBy`/`sumExprNormalized` to `FieldPath<Element>`.
- `relation(path).expr` exposes a scope-bound math-expression builder so `expr.field(...)` inside `sumExpr`/`sumExprBy`/`sumExprNormalized` is typed against the relation element.
- Top-level `expr.field` accepts an optional generic for opt-in tightening (`expr.field<E>("x")`).
- `agg` becomes a generic factory: `agg<Row>().field/sum/min/max(...)` constrains the path to `FieldPath<Row>`. Update call sites accordingly.
