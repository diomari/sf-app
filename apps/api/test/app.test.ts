import {
  createAccountInputSchema,
  errorResponseSchema,
} from '@salesforce-account-app/shared'
import type { Hono } from 'hono'
import { describe, expect, it } from 'vitest'

import { createApp } from '../src/app.js'
import type { AppEnvironment } from '../src/lib/environment.js'
import {
  createConsoleLogger,
  type Logger,
  type OperationalLogEvent,
} from '../src/lib/logger.js'
import {
  MAX_REQUEST_BODY_BYTES,
  parseJsonBody,
} from '../src/lib/parse-json-body.js'

interface CapturedLog {
  event: OperationalLogEvent
  level: 'info' | 'error'
}

const createCapturingLogger = () => {
  const logs: CapturedLog[] = []
  const logger: Logger = {
    info: (event) => logs.push({ event, level: 'info' }),
    error: (event) => logs.push({ event, level: 'error' }),
  }

  return { logger, logs }
}

const registerValidationRoute = (app: Hono<AppEnvironment>): void => {
  app.post('/test/accounts', async (context) => {
    await parseJsonBody(context, createAccountInputSchema)
    return context.body(null, 204)
  })
}

describe('API application shell', () => {
  it('returns the public health response without calling an integration', async () => {
    const { logger, logs } = createCapturingLogger()
    const app = createApp({
      createRequestId: () => 'generated-health-id',
      logger,
      now: () => 100,
    })

    const response = await app.request('/api/health')

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('x-request-id')).toBe('generated-health-id')
    expect(await response.json()).toEqual({ status: 'ok' })
    expect(logs).toEqual([
      {
        event: {
          requestId: 'generated-health-id',
          route: '/api/health',
          method: 'GET',
          durationMs: 0,
          outcome: 'success',
          status: 200,
        },
        level: 'info',
      },
    ])
  })

  it('ignores a browser-supplied request ID and generates one server-side', async () => {
    const { logger, logs } = createCapturingLogger()
    const app = createApp({
      createRequestId: () => 'generated-id',
      logger,
    })

    const response = await app.request('/api/health', {
      headers: { 'X-Request-Id': 'client.request-123' },
    })

    expect(response.headers.get('x-request-id')).toBe('generated-id')
    expect(JSON.stringify(logs)).not.toContain('client.request-123')
  })

  it('ignores an unsafe incoming request ID and never logs request secrets', async () => {
    const { logger, logs } = createCapturingLogger()
    const app = createApp({
      createRequestId: () => 'safe-generated-id',
      logger,
      registerRoutes: registerValidationRoute,
    })
    const unsafeRequestId = `unsafe-${'x'.repeat(70)}`
    const authorization = 'Bearer sensitive-cognito-token'
    const accountName = 'Confidential Customer Name'

    const response = await app.request('/test/accounts', {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json',
        'X-Request-Id': unsafeRequestId,
      },
      body: JSON.stringify({ name: accountName }),
    })

    expect(response.status).toBe(204)
    expect(response.headers.get('x-request-id')).toBe('safe-generated-id')
    const serializedLogs = JSON.stringify(logs)
    expect(serializedLogs).not.toContain(unsafeRequestId)
    expect(serializedLogs).not.toContain(authorization)
    expect(serializedLogs).not.toContain(accountName)
  })

  it('returns a stable not-found envelope and emits one completion log', async () => {
    const { logger, logs } = createCapturingLogger()
    const app = createApp({
      createRequestId: () => 'not-found-id',
      logger,
    })

    const response = await app.request('/missing')
    const body = errorResponseSchema.parse(await response.json())

    expect(response.status).toBe(404)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(body).toEqual({
      error: {
        code: 'ROUTE_NOT_FOUND',
        message: 'Route not found.',
        requestId: 'not-found-id',
      },
    })
    expect(logs).toEqual([
      {
        event: {
          requestId: 'not-found-id',
          route: '/*',
          method: 'GET',
          durationMs: expect.any(Number),
          outcome: 'client_error',
          status: 404,
          errorCode: 'ROUTE_NOT_FOUND',
        },
        level: 'info',
      },
    ])
  })

  it('normalizes unexpected errors without logging or returning their message', async () => {
    const { logger, logs } = createCapturingLogger()
    const sensitiveError = 'clientSecret=do-not-expose'
    const app = createApp({
      createRequestId: () => 'error-id',
      logger,
      registerRoutes: (instance) => {
        instance.get('/test/error', () => {
          throw new Error(sensitiveError)
        })
      },
    })

    const response = await app.request('/test/error')
    const body = errorResponseSchema.parse(await response.json())

    expect(response.status).toBe(500)
    expect(body.error).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
      requestId: 'error-id',
    })
    expect(JSON.stringify(logs)).not.toContain(sensitiveError)
    expect(logs).toEqual([
      {
        event: {
          requestId: 'error-id',
          route: '/test/error',
          method: 'GET',
          durationMs: expect.any(Number),
          outcome: 'server_error',
          status: 500,
          errorCode: 'INTERNAL_ERROR',
        },
        level: 'error',
      },
    ])
  })
})

describe('bounded JSON parsing', () => {
  it('rejects malformed JSON with the standard validation error', async () => {
    const { logger } = createCapturingLogger()
    const app = createApp({
      createRequestId: () => 'malformed-id',
      logger,
      registerRoutes: registerValidationRoute,
    })

    const response = await app.request('/test/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"name":',
    })
    const body = errorResponseSchema.parse(await response.json())

    expect(response.status).toBe(400)
    expect(body.error).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Request body is invalid.',
      requestId: 'malformed-id',
    })
  })

  it('rejects a declared body over 64 KiB before reading JSON', async () => {
    const { logger } = createCapturingLogger()
    const app = createApp({
      createRequestId: () => 'declared-oversized-id',
      logger,
      registerRoutes: registerValidationRoute,
    })

    const response = await app.request('/test/accounts', {
      method: 'POST',
      headers: {
        'Content-Length': String(MAX_REQUEST_BODY_BYTES + 1),
        'Content-Type': 'application/json',
      },
      body: 'not-json',
    })

    expect(response.status).toBe(413)
    expect(errorResponseSchema.parse(await response.json()).error.code).toBe(
      'PAYLOAD_TOO_LARGE',
    )
  })

  it('rejects a body over 64 KiB before schema processing', async () => {
    const { logger } = createCapturingLogger()
    const app = createApp({
      createRequestId: () => 'oversized-id',
      logger,
      registerRoutes: registerValidationRoute,
    })
    const oversizedName = 'x'.repeat(MAX_REQUEST_BODY_BYTES + 1)

    const response = await app.request('/test/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: oversizedName }),
    })
    const body = errorResponseSchema.parse(await response.json())

    expect(response.status).toBe(413)
    expect(body.error).toEqual({
      code: 'PAYLOAD_TOO_LARGE',
      message: 'Request body exceeds the 64 KiB limit.',
      requestId: 'oversized-id',
    })
  })

  it('rejects unknown and read-only Account keys through strict validation', async () => {
    const { logger } = createCapturingLogger()
    const app = createApp({
      createRequestId: () => 'strict-id',
      logger,
      registerRoutes: registerValidationRoute,
    })

    const response = await app.request('/test/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: '001000000000001AAA',
        name: 'Example Company',
      }),
    })

    expect(response.status).toBe(400)
    expect(errorResponseSchema.parse(await response.json()).error.code).toBe(
      'VALIDATION_ERROR',
    )
  })

  it('requires the JSON content type', async () => {
    const { logger } = createCapturingLogger()
    const app = createApp({
      createRequestId: () => 'content-type-id',
      logger,
      registerRoutes: registerValidationRoute,
    })

    const response = await app.request('/test/accounts', {
      method: 'POST',
      body: JSON.stringify({ name: 'Example Company' }),
    })

    expect(response.status).toBe(400)
  })
})

describe('console logger', () => {
  it('serializes only runtime-allowlisted operational fields', () => {
    const lines: string[] = []
    const logger = createConsoleLogger({
      now: () => new Date('2026-08-05T00:00:00.000Z'),
      writeInfo: (line) => lines.push(line),
      writeError: (line) => lines.push(line),
    })

    const uncheckedRuntimeEvent = Object.assign(
      {
        requestId: 'request-1',
        route: '/api/health',
        method: 'GET',
        durationMs: 3,
        outcome: 'success' as const,
        status: 200,
      },
      {
        authorization: 'Bearer sensitive-token',
        clientSecret: 'sensitive-client-secret',
        requestBody: { name: 'Confidential Account Name' },
      },
    )

    logger.info(uncheckedRuntimeEvent)

    expect(lines[0]).not.toContain('sensitive-token')
    expect(lines[0]).not.toContain('sensitive-client-secret')
    expect(lines[0]).not.toContain('Confidential Account Name')
    expect(JSON.parse(lines[0] ?? '')).toEqual({
      timestamp: '2026-08-05T00:00:00.000Z',
      level: 'info',
      requestId: 'request-1',
      route: '/api/health',
      method: 'GET',
      durationMs: 3,
      outcome: 'success',
      status: 200,
    })
  })
})
