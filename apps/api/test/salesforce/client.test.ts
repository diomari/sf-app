import { describe, expect, it, vi } from 'vitest'

import { AppError } from '../../src/errors/app-error.js'
import { createSalesforceClient } from '../../src/salesforce/client.js'
import type { SalesforceLogEvent, SalesforceLogger } from '../../src/salesforce/logger.js'
import type {
  CachedSalesforceToken,
  TokenProvider,
} from '../../src/salesforce/token-provider.js'

const TOKEN_A: CachedSalesforceToken = {
  accessToken: 'fixture-access-token-a',
  instanceUrl: 'https://fixture--sandbox.my.salesforce.com',
  expiresAt: 1_000_000,
}

const TOKEN_B: CachedSalesforceToken = {
  accessToken: 'fixture-access-token-b',
  instanceUrl: 'https://fixture--sandbox.my.salesforce.com',
  expiresAt: 2_000_000,
}

const createCapturingLogger = () => {
  const events: SalesforceLogEvent[] = []
  const logger: SalesforceLogger = {
    info: (event) => events.push(event),
    warn: (event) => events.push(event),
  }
  return { logger, events }
}

const createStubTokenProvider = (
  tokens: CachedSalesforceToken[],
): { tokenProvider: TokenProvider; calls: Array<{ forceRefresh?: boolean }> } => {
  const calls: Array<{ forceRefresh?: boolean }> = []
  let index = 0
  const tokenProvider: TokenProvider = {
    getToken: (options = {}) => {
      calls.push(options)
      const token = tokens[Math.min(index, tokens.length - 1)] as CachedSalesforceToken
      if (index < tokens.length - 1) {
        index += 1
      }
      return Promise.resolve(token)
    },
  }
  return { tokenProvider, calls }
}

describe('createSalesforceClient', () => {
  it('attaches the bearer token and returns the parsed JSON body on success', async () => {
    const { tokenProvider } = createStubTokenProvider([TOKEN_A])
    const boundedFetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    const client = createSalesforceClient({ boundedFetch, tokenProvider })

    const result = await client.request({ method: 'GET', path: '/services/data/v59.0/x' })

    expect(result).toEqual({ status: 200, body: { ok: true } })
    const [url, init] = boundedFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://fixture--sandbox.my.salesforce.com/services/data/v59.0/x')
    expect((init.headers as Record<string, string>)['Authorization']).toBe(
      'Bearer fixture-access-token-a',
    )
  })

  it('refreshes the token once and replays the request after an explicit 401', async () => {
    const { tokenProvider, calls } = createStubTokenProvider([TOKEN_A, TOKEN_B])
    const boundedFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('unauthorized', { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    const client = createSalesforceClient({ boundedFetch, tokenProvider })

    const result = await client.request({ method: 'GET', path: '/services/data/v59.0/x' })

    expect(result).toEqual({ status: 200, body: { ok: true } })
    expect(boundedFetch).toHaveBeenCalledTimes(2)
    expect(calls).toEqual([{}, { forceRefresh: true }])
    const [, secondInit] = boundedFetch.mock.calls[1] as [string, RequestInit]
    expect((secondInit.headers as Record<string, string>)['Authorization']).toBe(
      'Bearer fixture-access-token-b',
    )
  })

  it('replays a write (POST create) exactly once after a 401 since no mutation occurred', async () => {
    const { tokenProvider } = createStubTokenProvider([TOKEN_A, TOKEN_B])
    const boundedFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('unauthorized', { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: '001' }), { status: 201 }))
    const client = createSalesforceClient({ boundedFetch, tokenProvider })

    const result = await client.request({
      method: 'POST',
      path: '/services/data/v59.0/sobjects/Account',
      body: JSON.stringify({ Name: 'Example' }),
    })

    expect(result.status).toBe(201)
    expect(boundedFetch).toHaveBeenCalledTimes(2)
  })

  it('throws a normalized error and stops retrying if the replay also returns 401', async () => {
    const { tokenProvider } = createStubTokenProvider([TOKEN_A, TOKEN_B])
    const boundedFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('unauthorized', { status: 401 }))
      .mockResolvedValueOnce(new Response('still unauthorized', { status: 401 }))
    const client = createSalesforceClient({ boundedFetch, tokenProvider })

    await expect(
      client.request({ method: 'GET', path: '/services/data/v59.0/x' }),
    ).rejects.toMatchObject({ code: 'SALESFORCE_REJECTED' })
    expect(boundedFetch).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['a request timeout (bounded fetch throws)', 'timeout'],
    ['a 429 rate limit response', 429],
    ['a 500 server error response', 500],
    ['a 503 server error response', 503],
  ])('never retries after %s', async (_label, statusOrTimeout) => {
    const { tokenProvider } = createStubTokenProvider([TOKEN_A])
    const boundedFetch =
      statusOrTimeout === 'timeout'
        ? vi.fn().mockRejectedValue(new AppError(504, 'INTEGRATION_UNAVAILABLE', 'timed out'))
        : vi.fn().mockResolvedValue(new Response('failure', { status: statusOrTimeout as number }))
    const client = createSalesforceClient({ boundedFetch, tokenProvider })

    await expect(
      client.request({ method: 'DELETE', path: '/services/data/v59.0/sobjects/Account/1' }),
    ).rejects.toBeInstanceOf(AppError)
    expect(boundedFetch).toHaveBeenCalledTimes(1)
  })

  it('maps a 403 to INTEGRATION_FORBIDDEN', async () => {
    const { tokenProvider } = createStubTokenProvider([TOKEN_A])
    const boundedFetch = vi.fn().mockResolvedValue(new Response('forbidden', { status: 403 }))
    const client = createSalesforceClient({ boundedFetch, tokenProvider })

    await expect(
      client.request({ method: 'GET', path: '/services/data/v59.0/x' }),
    ).rejects.toMatchObject({ code: 'INTEGRATION_FORBIDDEN' })
  })

  it('maps a 429 to RATE_LIMITED', async () => {
    const { tokenProvider } = createStubTokenProvider([TOKEN_A])
    const boundedFetch = vi.fn().mockResolvedValue(new Response('slow down', { status: 429 }))
    const client = createSalesforceClient({ boundedFetch, tokenProvider })

    await expect(
      client.request({ method: 'GET', path: '/services/data/v59.0/x' }),
    ).rejects.toMatchObject({ code: 'RATE_LIMITED' })
  })

  it('maps a 5xx to INTEGRATION_UNAVAILABLE', async () => {
    const { tokenProvider } = createStubTokenProvider([TOKEN_A])
    const boundedFetch = vi.fn().mockResolvedValue(new Response('boom', { status: 502 }))
    const client = createSalesforceClient({ boundedFetch, tokenProvider })

    await expect(
      client.request({ method: 'GET', path: '/services/data/v59.0/x' }),
    ).rejects.toMatchObject({ code: 'INTEGRATION_UNAVAILABLE' })
  })

  it('never lets the client secret, access token, or full Salesforce error body reach the logs', async () => {
    const { tokenProvider } = createStubTokenProvider([TOKEN_A, TOKEN_B])
    const sensitiveErrorBody = JSON.stringify([
      {
        message: 'DUPLICATE_VALUE: clientSecret=super-secret-value access_token=fixture-access-token-a',
        errorCode: 'DUPLICATE_VALUE',
      },
    ])
    const boundedFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('unauthorized', { status: 401 }))
      .mockResolvedValueOnce(new Response(sensitiveErrorBody, { status: 400 }))
    const { logger, events } = createCapturingLogger()
    const client = createSalesforceClient({ boundedFetch, tokenProvider, logger })

    await expect(
      client.request({ method: 'POST', path: '/services/data/v59.0/sobjects/Account' }),
    ).rejects.toThrow(AppError)

    const serializedEvents = JSON.stringify(events)
    expect(serializedEvents).not.toContain('super-secret-value')
    expect(serializedEvents).not.toContain('fixture-access-token-a')
    expect(serializedEvents).not.toContain('fixture-access-token-b')
    expect(serializedEvents).not.toContain('DUPLICATE_VALUE')
    expect(events).toEqual([
      { event: 'token_refresh_after_401' },
      { event: 'request_failed', status: 400, code: 'SALESFORCE_REJECTED' },
    ])
  })
})
