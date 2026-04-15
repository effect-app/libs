/* eslint-disable @typescript-eslint/no-explicit-any */
import type Sqlite from "better-sqlite3"
import BetterSqlite from "better-sqlite3"
import { describe, expect, it } from "vitest"
import { parseRow } from "../src/Store/SQL.js"
import { buildWhereSQLQuery, pgDialect, sqliteDialect } from "../src/Store/SQL/query.js"
import { makeETag } from "../src/Store/utils.js"

const query = (db: Sqlite.Database, sql: string, params: unknown[] = []) =>
  db.prepare(sql).all(...params as any[]) as any[]

// --- Query builder unit tests ---

describe("SQL query builder (SQLite dialect)", () => {
  it("where eq string", () => {
    const result = buildWhereSQLQuery(
      sqliteDialect,
      "id",
      [{ t: "where", path: "name", op: "eq", value: "John" }],
      "users",
      {}
    )
    expect(result.sql).toContain("json_extract(data, '$.name') = ?")
    expect(result.params).toContain("John")
  })

  it("where eq number", () => {
    const result = buildWhereSQLQuery(
      sqliteDialect,
      "id",
      [{ t: "where", path: "age", op: "eq", value: 25 as any }],
      "users",
      {}
    )
    expect(result.sql).toContain("json_extract(data, '$.age') = ?")
    expect(result.params).toContain(25)
  })

  it("where gt", () => {
    const result = buildWhereSQLQuery(
      sqliteDialect,
      "id",
      [{ t: "where", path: "age", op: "gt", value: 18 as any }],
      "users",
      {}
    )
    expect(result.sql).toContain("json_extract(data, '$.age') > ?")
    expect(result.params).toContain(18)
  })

  it("where or", () => {
    const result = buildWhereSQLQuery(
      sqliteDialect,
      "id",
      [
        { t: "where", path: "name", op: "eq", value: "Alice" },
        { t: "or", path: "name", op: "eq", value: "Bob" }
      ],
      "users",
      {}
    )
    expect(result.sql).toContain("= ?")
    expect(result.sql).toContain("OR")
    expect(result.params).toEqual(expect.arrayContaining(["Alice", "Bob"]))
  })

  it("where and", () => {
    const result = buildWhereSQLQuery(
      sqliteDialect,
      "id",
      [
        { t: "where", path: "name", op: "eq", value: "Alice" },
        { t: "and", path: "age", op: "gt", value: 18 as any }
      ],
      "users",
      {}
    )
    expect(result.sql).toContain("AND")
    expect(result.params).toEqual(expect.arrayContaining(["Alice", 18]))
  })

  it("where in", () => {
    const result = buildWhereSQLQuery(
      sqliteDialect,
      "id",
      [{ t: "where", path: "id", op: "in", value: ["a", "b", "c"] as any }],
      "users",
      {}
    )
    expect(result.sql).toContain("id IN (?, ?, ?)")
    expect(result.params).toEqual(expect.arrayContaining(["a", "b", "c"]))
  })

  it("where null", () => {
    const result = buildWhereSQLQuery(
      sqliteDialect,
      "id",
      [{ t: "where", path: "status", op: "eq", value: null as any }],
      "users",
      {}
    )
    expect(result.sql).toContain("IS NULL")
  })

  it("where neq null", () => {
    const result = buildWhereSQLQuery(
      sqliteDialect,
      "id",
      [{ t: "where", path: "status", op: "neq", value: null as any }],
      "users",
      {}
    )
    expect(result.sql).toContain("IS NOT NULL")
  })

  it("where contains", () => {
    const result = buildWhereSQLQuery(
      sqliteDialect,
      "id",
      [{ t: "where", path: "name", op: "contains", value: "oh" }],
      "users",
      {}
    )
    expect(result.sql).toContain("LIKE")
    expect(result.sql).toContain("LOWER")
    expect(result.params).toContain("%oh%")
  })

  it("where startsWith", () => {
    const result = buildWhereSQLQuery(
      sqliteDialect,
      "id",
      [{ t: "where", path: "name", op: "startsWith", value: "Jo" }],
      "users",
      {}
    )
    expect(result.sql).toContain("LIKE")
    expect(result.params).toContain("Jo%")
  })

  it("where endsWith", () => {
    const result = buildWhereSQLQuery(
      sqliteDialect,
      "id",
      [{ t: "where", path: "name", op: "endsWith", value: "hn" }],
      "users",
      {}
    )
    expect(result.sql).toContain("LIKE")
    expect(result.params).toContain("%hn")
  })

  it("where includes (array contains)", () => {
    const result = buildWhereSQLQuery(
      sqliteDialect,
      "id",
      [{ t: "where", path: "tags", op: "includes", value: "admin" }],
      "users",
      {}
    )
    expect(result.sql).toContain("json_each")
    expect(result.sql).toContain("value = ?")
    expect(result.params).toContain("admin")
  })

  it("where includes-any (array contains any)", () => {
    const result = buildWhereSQLQuery(
      sqliteDialect,
      "id",
      [{ t: "where", path: "tags", op: "includes-any", value: ["admin", "user"] as any }],
      "users",
      {}
    )
    expect(result.sql).toContain("json_each")
    expect(result.sql).toContain("IN")
  })

  it("nested scopes", () => {
    const result = buildWhereSQLQuery(
      sqliteDialect,
      "id",
      [
        { t: "where", path: "a", op: "eq", value: "1" },
        {
          t: "or-scope",
          result: [
            { t: "where", path: "b", op: "eq", value: "2" },
            { t: "and", path: "c", op: "eq", value: "3" }
          ],
          relation: "some" as const
        }
      ],
      "test",
      {}
    )
    expect(result.sql).toContain("OR (")
    expect(result.sql).toContain("AND")
    expect(result.params).toEqual(expect.arrayContaining(["1", "2", "3"]))
  })

  it("id key maps to id column", () => {
    const result = buildWhereSQLQuery(
      sqliteDialect,
      "myId",
      [{ t: "where", path: "myId", op: "eq", value: "123" }],
      "users",
      {}
    )
    expect(result.sql).toContain("id = ?")
    expect(result.sql).not.toContain("json_extract")
    expect(result.params).toContain("123")
  })

  it("order + limit + skip", () => {
    const result = buildWhereSQLQuery(
      sqliteDialect,
      "id",
      [],
      "users",
      {},
      undefined,
      [{ key: "name", direction: "ASC" }] as any,
      5,
      10
    )
    expect(result.sql).toContain("ORDER BY")
    expect(result.sql).toContain("ASC")
    expect(result.sql).toContain("LIMIT")
    expect(result.sql).toContain("OFFSET")
  })
})

describe("SQL query builder (PostgreSQL dialect)", () => {
  it("where eq string uses ->> operator", () => {
    const result = buildWhereSQLQuery(
      pgDialect,
      "id",
      [{ t: "where", path: "name", op: "eq", value: "John" }],
      "users",
      {}
    )
    expect(result.sql).toContain("data->>'name'")
    expect(result.sql).toContain("$1")
    expect(result.params).toContain("John")
  })

  it("where contains uses ILIKE", () => {
    const result = buildWhereSQLQuery(
      pgDialect,
      "id",
      [{ t: "where", path: "name", op: "contains", value: "oh" }],
      "users",
      {}
    )
    expect(result.sql).toContain("ILIKE")
    expect(result.params).toContain("%oh%")
  })

  it("where in uses $N placeholders", () => {
    const result = buildWhereSQLQuery(
      pgDialect,
      "id",
      [{ t: "where", path: "status", op: "in", value: ["active", "pending"] as any }],
      "users",
      {}
    )
    expect(result.sql).toContain("$1")
    expect(result.sql).toContain("$2")
    expect(result.params).toEqual(expect.arrayContaining(["active", "pending"]))
  })

  it("where includes uses @> jsonb operator", () => {
    const result = buildWhereSQLQuery(
      pgDialect,
      "id",
      [{ t: "where", path: "tags", op: "includes", value: "admin" }],
      "users",
      {}
    )
    expect(result.sql).toContain("@>")
    expect(result.sql).toContain("jsonb")
  })

  it("nested path uses chained -> operators", () => {
    const result = buildWhereSQLQuery(
      pgDialect,
      "id",
      [{ t: "where", path: "address.city", op: "eq", value: "NYC" }],
      "users",
      {}
    )
    expect(result.sql).toContain("data->'address'->>'city'")
  })
})

// --- Integration tests with in-memory SQLite (direct, no Effect SQL client) ---

describe("SQL Store (SQLite integration)", () => {
  const withDb = (fn: (db: Sqlite.Database) => void) => {
    const db = new BetterSqlite(":memory:")
    db.pragma("journal_mode = WAL")
    try {
      fn(db)
    } finally {
      db.close()
    }
  }

  it("creates table and seeds data", () =>
    withDb((db) => {
      db.exec(
        `CREATE TABLE IF NOT EXISTS "test_items" (id TEXT PRIMARY KEY, _etag TEXT, data JSON NOT NULL)`
      )
      db
        .prepare(`INSERT INTO "test_items" (id, _etag, data) VALUES (?, ?, ?)`)
        .run("1", "etag1", JSON.stringify({ name: "Alice", age: 30 }))

      const rows = db.prepare(`SELECT * FROM "test_items"`).all()
      expect(rows.length).toBe(1)
      expect((rows[0] as any).id).toBe("1")
    }))

  it("data column should not contain _etag or id", () =>
    withDb((db) => {
      db.exec(
        `CREATE TABLE IF NOT EXISTS "test_clean" (id TEXT PRIMARY KEY, _etag TEXT, data JSON NOT NULL)`
      )
      // Simulate what toRow now produces: data without id or _etag
      const data = { name: "Alice", age: 30, tags: ["admin"] }
      db
        .prepare(`INSERT INTO "test_clean" (id, _etag, data) VALUES (?, ?, ?)`)
        .run("1", "etag1", JSON.stringify(data))

      const row = db.prepare(`SELECT * FROM "test_clean" WHERE id = ?`).get("1") as any
      const parsed = JSON.parse(row.data) as any
      expect(parsed).not.toHaveProperty("id")
      expect(parsed).not.toHaveProperty("_etag")
      expect(parsed.name).toBe("Alice")
      expect(parsed.age).toBe(30)
      expect(parsed.tags).toEqual(["admin"])
      // id and _etag come from their own columns
      expect(row.id).toBe("1")
      expect(row._etag).toBe("etag1")
    }))

  it("backward compat: rows with id/_etag in data still work with queries", () =>
    withDb((db) => {
      db.exec(
        `CREATE TABLE IF NOT EXISTS "test_compat" (id TEXT PRIMARY KEY, _etag TEXT, data JSON NOT NULL)`
      )
      // Old format: id and _etag inside data
      db
        .prepare(`INSERT INTO "test_compat" (id, _etag, data) VALUES (?, ?, ?)`)
        .run("1", "etag1", JSON.stringify({ id: "1", _etag: "old_etag", name: "Alice", age: 30 }))
      // New format: id and _etag stripped from data
      db
        .prepare(`INSERT INTO "test_compat" (id, _etag, data) VALUES (?, ?, ?)`)
        .run("2", "etag2", JSON.stringify({ name: "Bob", age: 25 }))

      // Both should be queryable by name
      const q1 = buildWhereSQLQuery(
        sqliteDialect,
        "id",
        [{ t: "where", path: "name", op: "eq", value: "Alice" }],
        "test_compat",
        {}
      )
      const r1 = query(db, q1.sql, q1.params)
      expect(r1.length).toBe(1)
      expect((r1[0] as any).id).toBe("1")

      const q2 = buildWhereSQLQuery(
        sqliteDialect,
        "id",
        [{ t: "where", path: "name", op: "eq", value: "Bob" }],
        "test_compat",
        {}
      )
      const r2 = query(db, q2.sql, q2.params)
      expect(r2.length).toBe(1)
      expect((r2[0] as any).id).toBe("2")

      // Both queryable by id column
      const q3 = buildWhereSQLQuery(
        sqliteDialect,
        "id",
        [{ t: "where", path: "id", op: "in", value: ["1", "2"] as any }],
        "test_compat",
        {}
      )
      expect(query(db, q3.sql, q3.params).length).toBe(2)
    }))

  it("queries work when data does not contain id", () =>
    withDb((db) => {
      db.exec(
        `CREATE TABLE IF NOT EXISTS "test_noid" (id TEXT PRIMARY KEY, _etag TEXT, data JSON NOT NULL)`
      )
      const people = [
        { name: "Alice", age: 30 },
        { name: "Bob", age: 25 },
        { name: "Charlie", age: 35 }
      ]
      const insert = db.prepare(
        `INSERT INTO "test_noid" (id, _etag, data) VALUES (?, ?, ?)`
      )
      people.forEach((p, i) => insert.run(String(i + 1), `etag_${i + 1}`, JSON.stringify(p)))

      // Filter by field in data
      const q1 = buildWhereSQLQuery(
        sqliteDialect,
        "id",
        [{ t: "where", path: "age", op: "gt", value: 28 as any }],
        "test_noid",
        {}
      )
      expect(query(db, q1.sql, q1.params).length).toBe(2) // Alice(30), Charlie(35)

      // Filter by id column
      const q2 = buildWhereSQLQuery(
        sqliteDialect,
        "id",
        [{ t: "where", path: "id", op: "eq", value: "2" }],
        "test_noid",
        {}
      )
      const r2 = query(db, q2.sql, q2.params)
      expect(r2.length).toBe(1)
      expect((r2[0] as any).id).toBe("2")
      expect((JSON.parse((r2[0] as any).data) as any).name).toBe("Bob")

      // Order + limit still works
      const q3 = buildWhereSQLQuery(
        sqliteDialect,
        "id",
        [],
        "test_noid",
        {},
        undefined,
        [{ key: "age", direction: "ASC" }] as any,
        undefined,
        2
      )
      const r3 = query(db, q3.sql, q3.params)
      expect(r3.length).toBe(2)
      expect((JSON.parse((r3[0] as any).data) as any).name).toBe("Bob") // youngest first
    }))

  it("query builder generates valid SQL for SQLite", () =>
    withDb((db) => {
      db.exec(
        `CREATE TABLE IF NOT EXISTS "test_people" (id TEXT PRIMARY KEY, _etag TEXT, data JSON NOT NULL)`
      )

      const people = [
        { id: "1", name: "Alice", age: 30, tags: ["admin", "user"] },
        { id: "2", name: "Bob", age: 25, tags: ["user"] },
        { id: "3", name: "Charlie", age: 35, tags: ["admin"] },
        { id: "4", name: "Diana", age: 28, tags: ["user", "editor"] }
      ]

      const insert = db.prepare(
        `INSERT INTO "test_people" (id, _etag, data) VALUES (?, ?, ?)`
      )
      for (const p of people) {
        const { id, ...data } = p
        insert.run(id, `etag_${id}`, JSON.stringify(data))
      }

      // Test eq
      const q1 = buildWhereSQLQuery(
        sqliteDialect,
        "id",
        [{ t: "where", path: "name", op: "eq", value: "Alice" }],
        "test_people",
        {}
      )
      expect(query(db, q1.sql, q1.params).length).toBe(1)
      expect((JSON.parse((query(db, q1.sql, q1.params)[0] as any).data) as any).name).toBe("Alice")

      // Test gt
      const q2 = buildWhereSQLQuery(
        sqliteDialect,
        "id",
        [{ t: "where", path: "age", op: "gt", value: 28 as any }],
        "test_people",
        {}
      )
      expect(query(db, q2.sql, q2.params).length).toBe(2)

      // Test OR
      const q3 = buildWhereSQLQuery(
        sqliteDialect,
        "id",
        [
          { t: "where", path: "name", op: "eq", value: "Alice" },
          { t: "or", path: "name", op: "eq", value: "Bob" }
        ],
        "test_people",
        {}
      )
      expect(query(db, q3.sql, q3.params).length).toBe(2)

      // Test AND
      const q4 = buildWhereSQLQuery(
        sqliteDialect,
        "id",
        [
          { t: "where", path: "name", op: "eq", value: "Alice" },
          { t: "and", path: "age", op: "gt", value: 25 as any }
        ],
        "test_people",
        {}
      )
      const r4 = query(db, q4.sql, q4.params)
      expect(r4.length).toBe(1)
      expect((JSON.parse((r4[0] as any).data) as any).name).toBe("Alice")

      // Test IN
      const q5 = buildWhereSQLQuery(
        sqliteDialect,
        "id",
        [{ t: "where", path: "id", op: "in", value: ["1", "3"] as any }],
        "test_people",
        {}
      )
      expect(query(db, q5.sql, q5.params).length).toBe(2)

      // Test contains (string)
      const q6 = buildWhereSQLQuery(
        sqliteDialect,
        "id",
        [{ t: "where", path: "name", op: "contains", value: "li" }],
        "test_people",
        {}
      )
      expect(query(db, q6.sql, q6.params).length).toBe(2) // Alice, Charlie

      // Test startsWith
      const q7 = buildWhereSQLQuery(
        sqliteDialect,
        "id",
        [{ t: "where", path: "name", op: "startsWith", value: "Al" }],
        "test_people",
        {}
      )
      const r7 = query(db, q7.sql, q7.params)
      expect(r7.length).toBe(1)
      expect((JSON.parse((r7[0] as any).data) as any).name).toBe("Alice")

      // Test includes (array)
      const q8 = buildWhereSQLQuery(
        sqliteDialect,
        "id",
        [{ t: "where", path: "tags", op: "includes", value: "admin" }],
        "test_people",
        {}
      )
      expect(query(db, q8.sql, q8.params).length).toBe(2) // Alice, Charlie

      // Test nested scope: where name = Alice OR (age > 30 AND name contains 'ar')
      const q9 = buildWhereSQLQuery(
        sqliteDialect,
        "id",
        [
          { t: "where", path: "name", op: "eq", value: "Alice" },
          {
            t: "or-scope",
            result: [
              { t: "where", path: "age", op: "gt", value: 30 as any },
              { t: "and", path: "name", op: "contains", value: "ar" }
            ],
            relation: "some"
          }
        ],
        "test_people",
        {}
      )
      expect(query(db, q9.sql, q9.params).length).toBe(2) // Alice + Charlie

      // Test order + limit
      const q10 = buildWhereSQLQuery(
        sqliteDialect,
        "id",
        [],
        "test_people",
        {},
        undefined,
        [{ key: "age", direction: "DESC" }] as any,
        undefined,
        2
      )
      const r10 = query(db, q10.sql, q10.params)
      expect(r10.length).toBe(2)
      expect((JSON.parse((r10[0] as any).data) as any).name).toBe("Charlie") // oldest first
    }))

  it("namespace param is in correct position for SQLite positional placeholders", () =>
    withDb((db) => {
      db.exec(
        `CREATE TABLE IF NOT EXISTS "test_ns" (id TEXT NOT NULL, _namespace TEXT NOT NULL DEFAULT 'primary', _etag TEXT, data JSON NOT NULL, PRIMARY KEY (id, _namespace))`
      )
      const insert = db.prepare(
        `INSERT INTO "test_ns" (id, _namespace, _etag, data) VALUES (?, ?, ?, ?)`
      )
      insert.run("1", "primary", "e1", JSON.stringify({ name: "Alice", role: "admin" }))
      insert.run("2", "primary", "e2", JSON.stringify({ name: "Bob", role: "user" }))
      insert.run("3", "other", "e3", JSON.stringify({ name: "Charlie", role: "admin" }))

      // Build a filter query: role != 'deleted'
      const q = buildWhereSQLQuery(
        sqliteDialect,
        "id",
        [{ t: "where", path: "role", op: "neq", value: "deleted" }],
        "test_ns",
        {}
      )

      // Simulate what SQL.ts does: prepend _namespace = ? and put ns FIRST in params
      const hasWhere = q.sql.includes("WHERE")
      const nsSql = hasWhere
        ? q.sql.replace("WHERE", `WHERE _namespace = ? AND`)
        : q.sql.replace(`FROM "test_ns"`, `FROM "test_ns" WHERE _namespace = ?`)
      const params = ["primary", ...q.params]

      const results = query(db, nsSql, params)
      // Should only get Alice and Bob (primary namespace), not Charlie (other namespace)
      expect(results.length).toBe(2)
      const names = results.map((r) => (JSON.parse((r as any).data) as any).name).sort()
      expect(names).toEqual(["Alice", "Bob"])
    }))
})

// --- boolean WHERE clause tests (regression: where("x", true) must work per dialect) ---

describe("boolean WHERE clauses — query builder", () => {
  it("sqlite: eq true serializes bool → 1 integer", () => {
    const result = buildWhereSQLQuery(
      sqliteDialect,
      "id",
      [{ t: "where", path: "flag", op: "eq", value: true as any }],
      "t",
      {}
    )
    expect(result.sql).toContain("json_extract(data, '$.flag') = ?")
    expect(result.params).toEqual([1])
  })

  it("sqlite: eq false serializes bool → 0 integer", () => {
    const result = buildWhereSQLQuery(
      sqliteDialect,
      "id",
      [{ t: "where", path: "flag", op: "eq", value: false as any }],
      "t",
      {}
    )
    expect(result.params).toEqual([0])
  })

  it("sqlite: neq/in also serialize booleans", () => {
    const r1 = buildWhereSQLQuery(
      sqliteDialect,
      "id",
      [{ t: "where", path: "flag", op: "neq", value: true as any }],
      "t",
      {}
    )
    expect(r1.params).toEqual([1])

    const r2 = buildWhereSQLQuery(
      sqliteDialect,
      "id",
      [{ t: "where", path: "flag", op: "in", value: [true, false] as any }],
      "t",
      {}
    )
    expect(r2.params).toEqual([1, 0])
  })

  it("pg: eq true serializes bool → 'true' text (matches ->> output)", () => {
    const result = buildWhereSQLQuery(
      pgDialect,
      "id",
      [{ t: "where", path: "flag", op: "eq", value: true as any }],
      "t",
      {}
    )
    expect(result.sql).toContain("data->>'flag' = $1")
    expect(result.params).toEqual(["true"])
  })

  it("pg: eq false serializes bool → 'false' text", () => {
    const result = buildWhereSQLQuery(
      pgDialect,
      "id",
      [{ t: "where", path: "flag", op: "eq", value: false as any }],
      "t",
      {}
    )
    expect(result.params).toEqual(["false"])
  })

  it("pg: in with booleans serializes as text list", () => {
    const result = buildWhereSQLQuery(
      pgDialect,
      "id",
      [{ t: "where", path: "flag", op: "in", value: [true, false] as any }],
      "t",
      {}
    )
    expect(result.params).toEqual(["true", "false"])
  })

  it("non-boolean scalars pass through unchanged (sqlite)", () => {
    const result = buildWhereSQLQuery(
      sqliteDialect,
      "id",
      [{ t: "where", path: "name", op: "eq", value: "Alice" }],
      "t",
      {}
    )
    expect(result.params).toEqual(["Alice"])
  })

  it("non-boolean scalars pass through unchanged (pg)", () => {
    const result = buildWhereSQLQuery(
      pgDialect,
      "id",
      [{ t: "where", path: "age", op: "gt", value: 18 as any }],
      "t",
      {}
    )
    expect(result.params).toEqual([18])
  })
})

describe("boolean WHERE clauses — SQLite integration (end-to-end)", () => {
  const withDb = (fn: (db: Sqlite.Database) => void) => {
    const db = new BetterSqlite(":memory:")
    try {
      fn(db)
    } finally {
      db.close()
    }
  }

  it("where flag = true matches only true rows", () =>
    withDb((db) => {
      db.exec(`CREATE TABLE "t" (id TEXT PRIMARY KEY, _etag TEXT, data JSON NOT NULL)`)
      db
        .prepare(`INSERT INTO "t" (id, _etag, data) VALUES (?, ?, ?)`)
        .run("1", "e", JSON.stringify({ flag: true, name: "Alice" }))
      db
        .prepare(`INSERT INTO "t" (id, _etag, data) VALUES (?, ?, ?)`)
        .run("2", "e", JSON.stringify({ flag: false, name: "Bob" }))

      const q = buildWhereSQLQuery(
        sqliteDialect,
        "id",
        [{ t: "where", path: "flag", op: "eq", value: true as any }],
        "t",
        {}
      )
      const rows = query(db, q.sql, q.params)
      expect(rows.length).toBe(1)
      expect((JSON.parse((rows[0] as any).data) as any).name).toBe("Alice")
    }))

  it("where flag = false matches only false rows", () =>
    withDb((db) => {
      db.exec(`CREATE TABLE "t" (id TEXT PRIMARY KEY, _etag TEXT, data JSON NOT NULL)`)
      db
        .prepare(`INSERT INTO "t" (id, _etag, data) VALUES (?, ?, ?)`)
        .run("1", "e", JSON.stringify({ flag: true, name: "Alice" }))
      db
        .prepare(`INSERT INTO "t" (id, _etag, data) VALUES (?, ?, ?)`)
        .run("2", "e", JSON.stringify({ flag: false, name: "Bob" }))

      const q = buildWhereSQLQuery(
        sqliteDialect,
        "id",
        [{ t: "where", path: "flag", op: "eq", value: false as any }],
        "t",
        {}
      )
      const rows = query(db, q.sql, q.params)
      expect(rows.length).toBe(1)
      expect((JSON.parse((rows[0] as any).data) as any).name).toBe("Bob")
    }))

  it("where nested boolean path works", () =>
    withDb((db) => {
      db.exec(`CREATE TABLE "t" (id TEXT PRIMARY KEY, _etag TEXT, data JSON NOT NULL)`)
      db
        .prepare(`INSERT INTO "t" (id, _etag, data) VALUES (?, ?, ?)`)
        .run("1", "e", JSON.stringify({ meta: { active: true }, name: "Alice" }))
      db
        .prepare(`INSERT INTO "t" (id, _etag, data) VALUES (?, ?, ?)`)
        .run("2", "e", JSON.stringify({ meta: { active: false }, name: "Bob" }))

      const q = buildWhereSQLQuery(
        sqliteDialect,
        "id",
        [{ t: "where", path: "meta.active", op: "eq", value: true as any }],
        "t",
        {}
      )
      const rows = query(db, q.sql, q.params)
      expect(rows.length).toBe(1)
      expect((JSON.parse((rows[0] as any).data) as any).name).toBe("Alice")
    }))

  it("where neq boolean works", () =>
    withDb((db) => {
      db.exec(`CREATE TABLE "t" (id TEXT PRIMARY KEY, _etag TEXT, data JSON NOT NULL)`)
      db
        .prepare(`INSERT INTO "t" (id, _etag, data) VALUES (?, ?, ?)`)
        .run("1", "e", JSON.stringify({ flag: true, name: "Alice" }))
      db
        .prepare(`INSERT INTO "t" (id, _etag, data) VALUES (?, ?, ?)`)
        .run("2", "e", JSON.stringify({ flag: false, name: "Bob" }))

      const q = buildWhereSQLQuery(
        sqliteDialect,
        "id",
        [{ t: "where", path: "flag", op: "neq", value: true as any }],
        "t",
        {}
      )
      const rows = query(db, q.sql, q.params)
      expect(rows.length).toBe(1)
      expect((JSON.parse((rows[0] as any).data) as any).name).toBe("Bob")
    }))
})

// --- jsonExtractJson dialect tests (regression: booleans must survive round-trip) ---

describe("sqliteDialect.jsonExtractJson boolean round-trip", () => {
  const withDb = (fn: (db: Sqlite.Database) => void) => {
    const db = new BetterSqlite(":memory:")
    try {
      fn(db)
    } finally {
      db.close()
    }
  }

  it("SQL uses json_type CASE to preserve booleans", () => {
    const sql = sqliteDialect.jsonExtractJson("flag")
    expect(sql).toContain("json_type(data, '$.flag')")
    expect(sql).toContain("'true'")
    expect(sql).toContain("'false'")
    expect(sql).toContain("json_quote(json_extract(data, '$.flag'))")
  })

  it("boolean false round-trips as false (not 0)", () =>
    withDb((db) => {
      db.exec(`CREATE TABLE "t" (data JSON NOT NULL)`)
      db.prepare(`INSERT INTO "t" (data) VALUES (?)`).run(JSON.stringify({ flag: false }))

      const row = db.prepare(`SELECT ${sqliteDialect.jsonExtractJson("flag")} AS v FROM "t"`).get() as any
      const parsed = JSON.parse(row.v)
      expect(parsed).toBe(false)
      expect(typeof parsed).toBe("boolean")
    }))

  it("boolean true round-trips as true (not 1)", () =>
    withDb((db) => {
      db.exec(`CREATE TABLE "t" (data JSON NOT NULL)`)
      db.prepare(`INSERT INTO "t" (data) VALUES (?)`).run(JSON.stringify({ flag: true }))

      const row = db.prepare(`SELECT ${sqliteDialect.jsonExtractJson("flag")} AS v FROM "t"`).get() as any
      const parsed = JSON.parse(row.v)
      expect(parsed).toBe(true)
      expect(typeof parsed).toBe("boolean")
    }))

  it("nested boolean round-trips correctly", () =>
    withDb((db) => {
      db.exec(`CREATE TABLE "t" (data JSON NOT NULL)`)
      db.prepare(`INSERT INTO "t" (data) VALUES (?)`).run(
        JSON.stringify({ nested: { flag: false } })
      )

      const row = db
        .prepare(`SELECT ${sqliteDialect.jsonExtractJson("nested.flag")} AS v FROM "t"`)
        .get() as any
      const parsed = JSON.parse(row.v)
      expect(parsed).toBe(false)
      expect(typeof parsed).toBe("boolean")
    }))

  it("numbers 0 and 1 still parse as numbers (not booleans)", () =>
    withDb((db) => {
      db.exec(`CREATE TABLE "t" (data JSON NOT NULL)`)
      db.prepare(`INSERT INTO "t" (data) VALUES (?)`).run(JSON.stringify({ zero: 0, one: 1 }))

      const zRow = db.prepare(`SELECT ${sqliteDialect.jsonExtractJson("zero")} AS v FROM "t"`).get() as any
      const oRow = db.prepare(`SELECT ${sqliteDialect.jsonExtractJson("one")} AS v FROM "t"`).get() as any
      expect(JSON.parse(zRow.v)).toBe(0)
      expect(typeof JSON.parse(zRow.v)).toBe("number")
      expect(JSON.parse(oRow.v)).toBe(1)
      expect(typeof JSON.parse(oRow.v)).toBe("number")
    }))

  it("strings, arrays, and null still round-trip correctly", () =>
    withDb((db) => {
      db.exec(`CREATE TABLE "t" (data JSON NOT NULL)`)
      db.prepare(`INSERT INTO "t" (data) VALUES (?)`).run(
        JSON.stringify({ s: "hello", arr: [1, 2, 3], nil: null })
      )

      const sRow = db.prepare(`SELECT ${sqliteDialect.jsonExtractJson("s")} AS v FROM "t"`).get() as any
      const aRow = db.prepare(`SELECT ${sqliteDialect.jsonExtractJson("arr")} AS v FROM "t"`).get() as any
      const nRow = db.prepare(`SELECT ${sqliteDialect.jsonExtractJson("nil")} AS v FROM "t"`).get() as any
      expect(JSON.parse(sRow.v)).toBe("hello")
      expect(JSON.parse(aRow.v)).toEqual([1, 2, 3])
      expect(JSON.parse(nRow.v)).toBe(null)
    }))
})

// --- toRow stripping and parseRow reconstruction tests ---

describe("toRow strips _etag and id from data", () => {
  // Replicate the toRow logic from SQL.ts to test in isolation
  const toRow = <IdKey extends PropertyKey>(e: any, idKey: IdKey) => {
    const newE = makeETag(e)
    const id = newE[idKey] as string
    const { _etag, [idKey]: _id, ...rest } = newE as any
    const data = JSON.stringify(rest)
    return { id, _etag: newE._etag!, data, item: newE }
  }

  it("data JSON does not contain _etag", () => {
    const row = toRow({ id: "1", _etag: undefined, name: "Alice", age: 30 }, "id")
    const parsed = JSON.parse(row.data) as any
    expect(parsed).not.toHaveProperty("_etag")
    expect(parsed.name).toBe("Alice")
    expect(parsed.age).toBe(30)
  })

  it("data JSON does not contain id field", () => {
    const row = toRow({ id: "1", _etag: undefined, name: "Alice" }, "id")
    const parsed = JSON.parse(row.data) as any
    expect(parsed).not.toHaveProperty("id")
    expect(parsed.name).toBe("Alice")
  })

  it("data JSON does not contain custom idKey field", () => {
    const row = toRow({ myId: "abc", _etag: undefined, name: "Bob" }, "myId")
    const parsed = JSON.parse(row.data) as any
    expect(parsed).not.toHaveProperty("myId")
    expect(parsed.name).toBe("Bob")
    expect(row.id).toBe("abc")
  })

  it("id and _etag are returned as separate fields", () => {
    const row = toRow({ id: "1", _etag: undefined, name: "Alice" }, "id")
    expect(row.id).toBe("1")
    expect(typeof row._etag).toBe("string")
    expect(row._etag.length).toBeGreaterThan(0)
  })

  it("item still contains all fields including _etag and id", () => {
    const row = toRow({ id: "1", _etag: undefined, name: "Alice" }, "id")
    expect(row.item.id).toBe("1")
    expect(row.item._etag).toBe(row._etag)
    expect(row.item.name).toBe("Alice")
  })

  it("preserves nested objects in data", () => {
    const row = toRow({ id: "1", _etag: undefined, address: { city: "NYC", zip: "10001" } }, "id")
    const parsed = JSON.parse(row.data) as any
    expect(parsed.address).toEqual({ city: "NYC", zip: "10001" })
    expect(parsed).not.toHaveProperty("id")
    expect(parsed).not.toHaveProperty("_etag")
  })
})

describe("parseRow reconstructs full object from row", () => {
  it("re-injects id from row column using idKey", () => {
    const result: any = parseRow(
      { id: "42", _etag: "etag1", data: JSON.stringify({ name: "Alice", age: 30 }) },
      "id",
      {}
    )
    expect(result.id).toBe("42")
    expect(result.name).toBe("Alice")
    expect(result.age).toBe(30)
    expect(result._etag).toBe("etag1")
  })

  it("re-injects custom idKey from row column", () => {
    const result: any = parseRow(
      { id: "abc", _etag: "etag2", data: JSON.stringify({ name: "Bob" }) },
      "myId",
      {}
    )
    expect(result.myId).toBe("abc")
    expect(result.name).toBe("Bob")
    expect(result._etag).toBe("etag2")
  })

  it("uses _etag from row column, not from data", () => {
    const result: any = parseRow(
      { id: "1", _etag: "column_etag", data: JSON.stringify({ _etag: "stale_data_etag", name: "Alice" }) },
      "id",
      {}
    )
    expect(result._etag).toBe("column_etag")
  })

  it("uses id from row column, not from data", () => {
    const result: any = parseRow(
      { id: "correct_id", _etag: "e1", data: JSON.stringify({ id: "wrong_id", name: "Alice" }) },
      "id",
      {}
    )
    expect(result.id).toBe("correct_id")
  })

  it("applies defaultValues for missing fields", () => {
    const result: any = parseRow(
      { id: "1", _etag: "e1", data: JSON.stringify({ name: "Alice" }) },
      "id",
      { status: "active", role: "user" }
    )
    expect(result.name).toBe("Alice")
    expect(result.status).toBe("active")
    expect(result.role).toBe("user")
  })

  it("data fields override defaultValues", () => {
    const result: any = parseRow(
      { id: "1", _etag: "e1", data: JSON.stringify({ name: "Alice", status: "inactive" }) },
      "id",
      { status: "active" }
    )
    expect(result.status).toBe("inactive")
  })

  it("handles null _etag from row", () => {
    const result: any = parseRow(
      { id: "1", _etag: null, data: JSON.stringify({ name: "Alice" }) },
      "id",
      {}
    )
    expect(result._etag).toBeUndefined()
  })

  it("round-trip: toRow then parseRow reconstructs the original", () => {
    const original = { id: "1", _etag: undefined as string | undefined, name: "Alice", age: 30, tags: ["admin"] }
    const newE = makeETag(original)
    const { _etag, id: _id, ...rest } = newE as any
    const row = { id: newE.id, _etag: newE._etag!, data: JSON.stringify(rest) }

    const reconstructed: any = parseRow(row, "id", {})
    expect(reconstructed.id).toBe("1")
    expect(reconstructed.name).toBe("Alice")
    expect(reconstructed.age).toBe(30)
    expect(reconstructed.tags).toEqual(["admin"])
    expect(reconstructed._etag).toBe(newE._etag)
  })
})
