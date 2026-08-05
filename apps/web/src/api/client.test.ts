import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { server } from '../../test/msw/server.js'
import { mockState } from '../../test/msw/server.js'
import { buildFakeAccount } from '../../test/fixtures/accounts.js'
import { ApiClient, ApiClientError } from './client.js'

const BASE_URL = 'https://api.example.test/api'

const buildClient = (
  overrides: Partial<{
    getAccessToken: () => string | null
    onUnauthorized: () => void
  }> = {},
) =>
  new ApiClient({
    baseUrl: BASE_URL,
    getAccessToken: overrides.getAccessToken ?? (() => 'fake-access-token'),
    onUnauthorized: overrides.onUnauthorized,
  })

describe('ApiClient', () => {
  beforeEach(() => {
    mockState.accounts = [buildFakeAccount()]
  })

  it('attaches the access token as a bearer header', async () => {
    let capturedAuthorization: string | null = null
    server.use(
      http.get('*/api/accounts', ({ request }) => {
        capturedAuthorization = request.headers.get('Authorization')
        return HttpResponse.json({
          data: [],
          meta: { pageSize: 50, hasMore: false, nextCursor: null },
        })
      }),
    )

    const client = buildClient({ getAccessToken: () => 'token-123' })
    await client.listAccounts()

    expect(capturedAuthorization).toBe('Bearer token-123')
  })

  it('does not call fetch and reports UNAUTHORIZED when there is no token', async () => {
    const onUnauthorized = vi.fn()
    const client = buildClient({ getAccessToken: () => null, onUnauthorized })

    await expect(client.listAccounts()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
    expect(onUnauthorized).toHaveBeenCalledOnce()
  })

  it('maps a 401 error envelope to ApiClientError and triggers re-auth', async () => {
    server.use(
      http.get('*/api/accounts', () =>
        HttpResponse.json(
          {
            error: {
              code: 'UNAUTHORIZED',
              message: 'Token expired.',
              requestId: 'req_test000000002',
            },
          },
          { status: 401 },
        ),
      ),
    )

    const onUnauthorized = vi.fn()
    const client = buildClient({ onUnauthorized })

    const error = await client.listAccounts().catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ApiClientError)
    expect((error as ApiClientError).code).toBe('UNAUTHORIZED')
    expect(onUnauthorized).toHaveBeenCalledOnce()
  })

  it('lists accounts and validates the page against the shared schema', async () => {
    const client = buildClient()
    const page = await client.listAccounts()

    expect(page.meta.pageSize).toBe(50)
    expect(page.data).toHaveLength(1)
    expect(page.data[0]?.name).toBe('Fixture Company')
  })

  it('sends search and cursor as query parameters', async () => {
    const captured: { url: URL | null } = { url: null }
    server.use(
      http.get('*/api/accounts', ({ request }) => {
        captured.url = new URL(request.url)
        return HttpResponse.json({
          data: [],
          meta: { pageSize: 50, hasMore: false, nextCursor: null },
        })
      }),
    )

    const client = buildClient()
    await client.listAccounts({ search: 'Acme', cursor: '50' })

    expect(captured.url?.searchParams.get('search')).toBe('Acme')
    expect(captured.url?.searchParams.get('cursor')).toBe('50')
  })

  it('creates an account and returns the id/name envelope', async () => {
    const client = buildClient()
    const result = await client.createAccount({ name: 'New Co' })

    expect(result.name).toBe('New Co')
    expect(mockState.accounts.some((account) => account.id === result.id)).toBe(
      true,
    )
  })

  it('updates an account, omitting unchanged fields and clearing null fields', async () => {
    const account = mockState.accounts[0]
    if (account === undefined) throw new Error('fixture missing')

    let capturedBody: unknown = null
    server.use(
      http.patch('*/api/accounts/:id', async ({ request, params }) => {
        capturedBody = await request.json()
        return HttpResponse.json({
          data: { id: String(params.id), updated: true },
        })
      }),
    )

    const client = buildClient()
    await client.updateAccount(
      account.id,
      { phone: null },
      new Date(account.lastModifiedDate).toUTCString(),
    )

    expect(capturedBody).toEqual({ phone: null })
  })

  it('surfaces a 412 conflict as PRECONDITION_FAILED', async () => {
    const account = mockState.accounts[0]
    if (account === undefined) throw new Error('fixture missing')

    const client = buildClient()
    const staleTimestamp = new Date(
      Date.parse(account.lastModifiedDate) - 1000,
    ).toUTCString()

    const error = await client
      .updateAccount(account.id, { phone: '999' }, staleTimestamp)
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ApiClientError)
    expect((error as ApiClientError).code).toBe('PRECONDITION_FAILED')
  })

  it('deletes an account and resolves with no content', async () => {
    const account = mockState.accounts[0]
    if (account === undefined) throw new Error('fixture missing')

    const client = buildClient()
    await expect(client.deleteAccount(account.id)).resolves.toBeUndefined()
    expect(mockState.accounts).toHaveLength(0)
  })

  it('maps a network failure to INTEGRATION_UNAVAILABLE', async () => {
    server.use(http.get('*/api/accounts', () => HttpResponse.error()))

    const client = buildClient()
    const error = await client.listAccounts().catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ApiClientError)
    expect((error as ApiClientError).code).toBe('INTEGRATION_UNAVAILABLE')
  })

  it('falls back to INTERNAL_ERROR when the error body does not match the envelope', async () => {
    server.use(
      http.get('*/api/accounts', () =>
        HttpResponse.json({ unexpected: 'shape' }, { status: 500 }),
      ),
    )

    const client = buildClient()
    const error = await client.listAccounts().catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ApiClientError)
    expect((error as ApiClientError).code).toBe('INTERNAL_ERROR')
  })

  it('respects an externally supplied abort signal', async () => {
    const controller = new AbortController()
    controller.abort()

    const client = buildClient()
    await expect(
      client.listAccounts({ signal: controller.signal }),
    ).rejects.toBeInstanceOf(ApiClientError)
  })
})
