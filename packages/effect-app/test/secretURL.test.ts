import { Chunk, Config, ConfigProvider, Effect } from "effect"
import { describe, expect, test } from "vitest"
import { fromChunk, fromString, isSecretURL, make, secretURL, unsafeWipe, value } from "../src/Config/SecretURL.js"

const testUrls = [
  "https://example.com/path?key=secret123",
  "http://user:password@host.com:8080/resource",
  "postgres://admin:p4ssw0rd@db.internal:5432/mydb",
  "redis://default:token@cache.example.com:6379",
  "mongodb+srv://user:pass@cluster.mongodb.net/db",
  "https://api.example.com/v2/endpoint?token=abc&format=json"
]

describe("SecretURL", () => {
  describe("fromString / value roundtrip", () => {
    test.each(testUrls)("preserves %s", (url) => {
      const secret = fromString(url)
      expect(value(secret)).toBe(url)
    })
  })

  describe("make / value roundtrip", () => {
    test.each(testUrls)("preserves %s via byte array", (url) => {
      const bytes = url.split("").map((c) => c.charCodeAt(0))
      const secret = make(bytes)
      expect(value(secret)).toBe(url)
    })
  })

  describe("fromChunk / value roundtrip", () => {
    test.each(testUrls)("preserves %s via Chunk", (url) => {
      const chunk = Chunk.fromIterable(url.split(""))
      const secret = fromChunk(chunk)
      expect(value(secret)).toBe(url)
    })
  })

  describe("toString", () => {
    test("redacts the URL, showing only protocol", () => {
      const secret = fromString("https://example.com/secret")
      expect(String(secret)).toBe("SecretURL(https://<redacted>)")
    })

    test("shows http protocol", () => {
      const secret = fromString("http://example.com")
      expect(String(secret)).toBe("SecretURL(http://<redacted>)")
    })

    test("shows unknown for non-URL strings", () => {
      const secret = fromString("not-a-url")
      expect(String(secret)).toBe("SecretURL(unknown://<redacted>)")
    })
  })

  describe("toJSON", () => {
    test("returns tag and protocol only", () => {
      const secret = fromString("https://example.com/secret")
      expect(JSON.parse(JSON.stringify(secret))).toEqual({ _tag: "SecretURL", protocol: "https" })
    })

    test("returns unknown protocol for non-URL", () => {
      const secret = fromString("not-a-url")
      expect(JSON.parse(JSON.stringify(secret))).toEqual({ _tag: "SecretURL", protocol: "unknown" })
    })
  })

  describe("isSecretURL", () => {
    test("returns true for SecretURL", () => {
      const secret = fromString("https://example.com")
      expect(isSecretURL(secret)).toBe(true)
    })

    test("returns false for plain string", () => {
      expect(isSecretURL("https://example.com")).toBe(false)
    })

    test("returns false for plain object", () => {
      expect(isSecretURL({ raw: [1, 2, 3] })).toBe(false)
    })
  })

  describe("unsafeWipe", () => {
    test("zeroes out raw bytes", () => {
      const secret = fromString("https://example.com")
      unsafeWipe(secret)
      expect(value(secret)).toBe("\0".repeat("https://example.com".length))
    })
  })

  describe("non-URL strings", () => {
    const nonUrls = [
      "just-a-secret-token",
      "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc",
      "sk-1234567890abcdef",
      "some random string with spaces and symbols!@#$%"
    ]

    test.each(nonUrls)("preserves non-URL value: %s", (input) => {
      const secret = fromString(input)
      expect(value(secret)).toBe(input)
      expect(String(secret)).toBe("SecretURL(unknown://<redacted>)")
      expect(JSON.parse(JSON.stringify(secret))).toEqual({ _tag: "SecretURL", protocol: "unknown" })
    })
  })

  describe("special characters", () => {
    test("preserves URLs with encoded characters", () => {
      const url = "https://example.com/path?q=hello%20world&name=%C3%A9"
      expect(value(fromString(url))).toBe(url)
    })

    test("preserves URLs with unicode", () => {
      const url = "https://example.com/café"
      expect(value(fromString(url))).toBe(url)
    })

    test("preserves URLs with special query params", () => {
      const url = "https://example.com?a=1&b=2&c=foo+bar"
      expect(value(fromString(url))).toBe(url)
    })
  })

  describe("secretURL config", () => {
    const run = <A>(config: Config.Config<A>, provider: ConfigProvider.ConfigProvider) =>
      Effect.runSync(config.parse(provider))

    test("reads from env-style ConfigProvider (QUEUE_URL)", () => {
      const url = "https://sqs.us-east-1.amazonaws.com/123456789/my-queue"
      const provider = ConfigProvider.fromEnv({ env: { QUEUE_URL: url } })
      const result = run(secretURL("QUEUE_URL"), provider)
      expect(value(result)).toBe(url)
      expect(String(result)).toBe("SecretURL(https://<redacted>)")
    })

    test("reads from fromUnknown with nested config ({ queue: { url } })", () => {
      const url = "redis://default:token@cache.example.com:6379"
      const provider = ConfigProvider.fromUnknown({ queue: { url } })
      const config = secretURL("url").pipe(Config.nested("queue"))
      const result = run(config, provider)
      expect(value(result)).toBe(url)
      expect(String(result)).toBe("SecretURL(redis://<redacted>)")
    })

    test("reads non-URL secret from env", () => {
      const token = "sk-1234567890abcdef"
      const provider = ConfigProvider.fromEnv({ env: { API_KEY: token } })
      const result = run(secretURL("API_KEY"), provider)
      expect(value(result)).toBe(token)
      expect(String(result)).toBe("SecretURL(unknown://<redacted>)")
    })

    test("rejects empty string", () => {
      const provider = ConfigProvider.fromEnv({ env: { QUEUE_URL: "" } })
      expect(() => run(secretURL("QUEUE_URL"), provider)).toThrow()
    })
  })
})
