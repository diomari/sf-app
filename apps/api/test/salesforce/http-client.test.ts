import { describe, expect, it, vi } from 'vitest'

import { AppError } from '../../src/errors/app-error.js'
import { createBoundedFetch } from '../../src/salesforce/http-client.js'

describe('createBoundedFetch', () => {
  it('passes the request through to the underlying fetch implementation', async () => {
    const response = new Response('{}', { status: 200 })
    const fetchImpl = vi.fn().mockResolvedValue(response)
    const boundedFetch = createBoundedFetch({ fetch: fetchImpl, timeoutMs: 50 })

    const result = await boundedFetch('https://example.my.salesforce.com/x', {
      method: 'GET',
    })

    expect(result).toBe(response)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('maps a timeout to a normalized AppError and never lets it hang past the bound', async () => {
    const fetchImpl = vi.fn((_input: string, init: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'))
        })
      })
    })
    const boundedFetch = createBoundedFetch({ fetch: fetchImpl, timeoutMs: 10 })

    await expect(
      boundedFetch('https://example.my.salesforce.com/x', { method: 'GET' }),
    ).rejects.toMatchObject({ code: 'INTEGRATION_UNAVAILABLE' })
  })

  it('maps a network failure to a normalized AppError without leaking the raw error', async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValue(new Error('secret-internal-dns-detail'))
    const boundedFetch = createBoundedFetch({ fetch: fetchImpl, timeoutMs: 50 })

    try {
      await boundedFetch('https://example.my.salesforce.com/x', {
        method: 'GET',
      })
      throw new Error('expected boundedFetch to throw')
    } catch (error) {
      expect(error).toBeInstanceOf(AppError)
      expect(String((error as Error).message)).not.toContain(
        'secret-internal-dns-detail',
      )
    }
  })

  it('propagates caller-driven abort signals without treating them as a timeout', async () => {
    const controller = new AbortController()
    const fetchImpl = vi.fn((_input: string, init: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'))
        })
      })
    })
    const boundedFetch = createBoundedFetch({
      fetch: fetchImpl,
      timeoutMs: 5_000,
    })

    const requestPromise = boundedFetch(
      'https://example.my.salesforce.com/x',
      { method: 'GET' },
      controller.signal,
    )
    controller.abort()

    await expect(requestPromise).rejects.not.toBeInstanceOf(AppError)
  })
})
