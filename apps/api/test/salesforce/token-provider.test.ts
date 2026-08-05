import { describe, expect, it, vi } from 'vitest'

import { AppError } from '../../src/errors/app-error.js'
import { createTokenProvider } from '../../src/salesforce/token-provider.js'
import type { SalesforceSecret } from '../../src/salesforce/secrets-provider.js'

const SECRET: SalesforceSecret = {
  clientId: 'fixture-client-id',
  clientSecret: 'fixture-client-secret',
  loginUrl: 'https://fixture--sandbox.my.salesforce.com',
  cursorSigningKey: 'fixture-cursor-signing-key',
}

const tokenResponse = (overrides: Record<string, unknown> = {}) =>
  new Response(
    JSON.stringify({
      access_token: 'fixture-access-token',
      instance_url: 'https://fixture--sandbox.my.salesforce.com',
      token_type: 'Bearer',
      expires_in: 300,
      ...overrides,
    }),
    { status: 200 },
  )

describe('createTokenProvider', () => {
  it('acquires a token and reuses it while it remains fresh', async () => {
    const boundedFetch = vi.fn().mockResolvedValue(tokenResponse())
    const getSecret = vi.fn().mockResolvedValue(SECRET)
    let currentTime = 0
    const provider = createTokenProvider({
      boundedFetch,
      getSecret,
      now: () => currentTime,
    })

    const first = await provider.getToken()
    currentTime += 1_000
    const second = await provider.getToken()

    expect(first.accessToken).toBe('fixture-access-token')
    expect(second).toEqual(first)
    expect(boundedFetch).toHaveBeenCalledTimes(1)
  })

  it('coalesces concurrent callers into a single OAuth request (single-flight)', async () => {
    let resolveResponse: (response: Response) => void = () => undefined
    const responsePromise = new Promise<Response>((resolve) => {
      resolveResponse = resolve
    })
    const boundedFetch = vi.fn().mockReturnValue(responsePromise)
    const getSecret = vi.fn().mockResolvedValue(SECRET)
    const provider = createTokenProvider({ boundedFetch, getSecret })

    const first = provider.getToken()
    const second = provider.getToken()
    const third = provider.getToken()
    resolveResponse(tokenResponse())

    const results = await Promise.all([first, second, third])

    expect(boundedFetch).toHaveBeenCalledTimes(1)
    expect(getSecret).toHaveBeenCalledTimes(1)
    expect(results[0]).toEqual(results[1])
    expect(results[1]).toEqual(results[2])
  })

  it('refreshes once the cached token is within the expiry safety skew', async () => {
    const boundedFetch = vi.fn().mockImplementation(() => tokenResponse())
    const getSecret = vi.fn().mockResolvedValue(SECRET)
    let currentTime = 0
    const provider = createTokenProvider({
      boundedFetch,
      getSecret,
      now: () => currentTime,
      skewMs: 30_000,
    })

    await provider.getToken()
    currentTime += 300_000 - 30_000 + 1
    await provider.getToken()

    expect(boundedFetch).toHaveBeenCalledTimes(2)
  })

  it('forces a refresh even when the cached token is still fresh', async () => {
    const boundedFetch = vi.fn().mockImplementation(() => tokenResponse())
    const getSecret = vi.fn().mockResolvedValue(SECRET)
    const provider = createTokenProvider({ boundedFetch, getSecret })

    await provider.getToken()
    await provider.getToken({ forceRefresh: true })

    expect(boundedFetch).toHaveBeenCalledTimes(2)
  })

  it('falls back to a default TTL when Salesforce omits expires_in', async () => {
    const boundedFetch = vi
      .fn()
      .mockResolvedValue(tokenResponse({ expires_in: undefined }))
    const getSecret = vi.fn().mockResolvedValue(SECRET)
    let currentTime = 0
    const provider = createTokenProvider({
      boundedFetch,
      getSecret,
      now: () => currentTime,
      defaultTtlSeconds: 60,
      skewMs: 5_000,
    })

    await provider.getToken()
    currentTime += 10_000
    await provider.getToken()

    expect(boundedFetch).toHaveBeenCalledTimes(1)
  })

  it('rejects an invalid or rotated secret via a typed error and never calls Salesforce', async () => {
    const boundedFetch = vi.fn()
    const getSecret = vi
      .fn()
      .mockRejectedValue(new AppError(500, 'INTERNAL_ERROR', 'bad secret'))
    const provider = createTokenProvider({ boundedFetch, getSecret })

    await expect(provider.getToken()).rejects.toThrow(AppError)
    expect(boundedFetch).not.toHaveBeenCalled()
  })

  it('rejects a login URL outside the approved host allowlist', async () => {
    const boundedFetch = vi.fn()
    const getSecret = vi.fn().mockResolvedValue({
      ...SECRET,
      loginUrl: 'https://attacker.example.com',
    })
    const provider = createTokenProvider({ boundedFetch, getSecret })

    await expect(provider.getToken()).rejects.toThrow(AppError)
    expect(boundedFetch).not.toHaveBeenCalled()
  })

  it('rejects an instance_url outside the approved host allowlist', async () => {
    const boundedFetch = vi
      .fn()
      .mockResolvedValue(
        tokenResponse({ instance_url: 'https://attacker.example.com' }),
      )
    const getSecret = vi.fn().mockResolvedValue(SECRET)
    const provider = createTokenProvider({ boundedFetch, getSecret })

    await expect(provider.getToken()).rejects.toThrow(AppError)
  })

  it('rejects a malformed token response body', async () => {
    const boundedFetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ foo: 'bar' }), { status: 200 }))
    const getSecret = vi.fn().mockResolvedValue(SECRET)
    const provider = createTokenProvider({ boundedFetch, getSecret })

    await expect(provider.getToken()).rejects.toThrow(AppError)
  })

  it('rejects a non-2xx token endpoint response without leaking the body', async () => {
    const boundedFetch = vi
      .fn()
      .mockResolvedValue(
        new Response('{"error":"invalid_client","error_description":"secret-detail"}', {
          status: 400,
        }),
      )
    const getSecret = vi.fn().mockResolvedValue(SECRET)
    const provider = createTokenProvider({ boundedFetch, getSecret })

    try {
      await provider.getToken()
      throw new Error('expected getToken to throw')
    } catch (error) {
      expect(error).toBeInstanceOf(AppError)
      expect(String((error as Error).message)).not.toContain('secret-detail')
    }
  })
})
