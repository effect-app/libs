import { MssqlClient } from "@effect/sql-mssql"
import * as Duration from "effect/Duration"
import * as Layer from "effect/Layer"
import * as Redacted from "effect/Redacted"
import type * as MessageStorage from "effect/unstable/cluster/MessageStorage"
import type * as RunnerStorage from "effect/unstable/cluster/RunnerStorage"
import type * as ShardingConfig from "effect/unstable/cluster/ShardingConfig"
import * as SqlMessageStorage from "effect/unstable/cluster/SqlMessageStorage"
import * as SqlRunnerStorage from "effect/unstable/cluster/SqlRunnerStorage"

export interface ClusterAzureSqlConfig {
  readonly url: Redacted.Redacted<string>
  readonly prefix?: string | undefined
  readonly minConnections?: number | undefined
  readonly maxConnections?: number | undefined
  readonly connectionTTL?: Duration.Input | undefined
  readonly connectTimeout?: Duration.Input | undefined
  readonly encrypt?: boolean | undefined
  readonly trustServer?: boolean | undefined
}

interface ParsedConnection {
  readonly server: string
  readonly port?: number | undefined
  readonly instanceName?: string | undefined
  readonly database?: string | undefined
  readonly username?: string | undefined
  readonly password?: Redacted.Redacted | undefined
  readonly encrypt?: boolean | undefined
  readonly trustServer?: boolean | undefined
  readonly connectTimeout?: Duration.Input | undefined
}

export const mssqlConfigFromUrl = (config: ClusterAzureSqlConfig): MssqlClient.MssqlClientConfig => {
  const parsed = parseConnection(Redacted.value(config.url))
  return {
    ...parsed,
    encrypt: config.encrypt ?? parsed.encrypt ?? true,
    trustServer: config.trustServer ?? parsed.trustServer ?? false,
    minConnections: config.minConnections,
    maxConnections: config.maxConnections,
    connectionTTL: config.connectionTTL,
    connectTimeout: config.connectTimeout ?? parsed.connectTimeout
  }
}

export const layerSqlClient = (config: ClusterAzureSqlConfig) => MssqlClient.layer(mssqlConfigFromUrl(config))

export const layerAzureSql = (
  config: ClusterAzureSqlConfig
): Layer.Layer<
  MessageStorage.MessageStorage | RunnerStorage.RunnerStorage,
  never,
  ShardingConfig.ShardingConfig
> =>
  Layer
    .merge(
      SqlMessageStorage.layerWith({ prefix: config.prefix }),
      Layer.orDie(SqlRunnerStorage.layerWith({ prefix: config.prefix }))
    )
    .pipe(Layer.provide(Layer.orDie(layerSqlClient(config))))

const parseConnection = (value: string): ParsedConnection => {
  if (value.includes(";") && value.includes("=")) {
    return parseConnectionString(value)
  }
  return parseConnectionUrl(value)
}

const parseConnectionUrl = (value: string): ParsedConnection => {
  const url = new URL(value)
  const port = parsePort(url.port)
  const database = url.pathname.length > 1 ? decodeURIComponent(url.pathname.slice(1)) : undefined
  const username = url.username.length > 0 ? decodeURIComponent(url.username) : undefined
  const password = url.password.length > 0 ? Redacted.make(decodeURIComponent(url.password)) : undefined
  return {
    ...parseServer(url.hostname, port),
    database,
    username,
    password,
    encrypt: parseBoolean(url.searchParams.get("encrypt")),
    trustServer: parseBoolean(url.searchParams.get("trustServerCertificate") ?? url.searchParams.get("trustServer")),
    connectTimeout: parseSeconds(url.searchParams.get("connectTimeout") ?? url.searchParams.get("connectionTimeout"))
  }
}

const parseConnectionString = (value: string): ParsedConnection => {
  const parts = new Map<string, string>()
  for (const part of value.split(";")) {
    const separator = part.indexOf("=")
    if (separator === -1) continue
    const key = part.slice(0, separator).trim().toLowerCase().replace(/\s+/g, "")
    const field = part.slice(separator + 1).trim()
    if (field.length > 0) {
      parts.set(key, field)
    }
  }

  const server = readPart(parts, "server", "datasource", "address", "addr", "networkaddress")
  if (server === undefined) {
    throw new Error("Azure SQL connection string is missing Server")
  }

  const password = readPart(parts, "password", "pwd")
  return {
    ...parseServer(server, parsePort(readPart(parts, "port"))),
    database: readPart(parts, "database", "initialcatalog"),
    username: readPart(parts, "userid", "uid", "user"),
    password: password === undefined ? undefined : Redacted.make(password),
    encrypt: parseBoolean(readPart(parts, "encrypt")),
    trustServer: parseBoolean(readPart(parts, "trustservercertificate")),
    connectTimeout: parseSeconds(readPart(parts, "connectiontimeout", "connecttimeout"))
  }
}

const parseServer = (
  input: string,
  port: number | undefined
): Pick<ParsedConnection, "server" | "port" | "instanceName"> => {
  let server = input.trim()
  if (server.toLowerCase().startsWith("tcp:")) {
    server = server.slice(4)
  }

  let parsedPort = port
  const comma = server.lastIndexOf(",")
  if (comma !== -1) {
    parsedPort = parsePort(server.slice(comma + 1))
    server = server.slice(0, comma)
  }

  const instanceSeparator = server.indexOf("\\")
  if (instanceSeparator !== -1) {
    return {
      server: server.slice(0, instanceSeparator),
      instanceName: server.slice(instanceSeparator + 1),
      port: parsedPort
    }
  }

  return { server, port: parsedPort }
}

const readPart = (parts: ReadonlyMap<string, string>, ...keys: ReadonlyArray<string>) => {
  for (const key of keys) {
    const value = parts.get(key)
    if (value !== undefined) return value
  }
  return undefined
}

const parsePort = (value: string | undefined): number | undefined => {
  if (value === undefined || value.length === 0) return undefined
  const port = Number(value)
  if (Number.isInteger(port) && port > 0) return port
  throw new Error(`Invalid Azure SQL port: ${value}`)
}

const parseSeconds = (value: string | undefined | null): Duration.Duration | undefined => {
  if (value === undefined || value === null || value.length === 0) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return Duration.seconds(seconds)
  throw new Error(`Invalid Azure SQL timeout: ${value}`)
}

const parseBoolean = (value: string | undefined | null): boolean | undefined => {
  if (value === undefined || value === null || value.length === 0) return undefined
  switch (value.trim().toLowerCase()) {
    case "true":
    case "yes":
    case "1":
      return true
    case "false":
    case "no":
    case "0":
      return false
    default:
      throw new Error(`Invalid Azure SQL boolean: ${value}`)
  }
}
