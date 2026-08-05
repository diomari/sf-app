import type {
  Account,
  CreateAccountInput,
  UpdateAccountInput,
} from '@salesforce-account-app/shared'
import { HttpResponse, http } from 'msw'

export interface MockAccountsState {
  accounts: Account[]
}

const PAGE_SIZE = 50

const matchesSearch = (account: Account, search: string): boolean => {
  const term = search.toLowerCase()
  return (
    account.name.toLowerCase().includes(term) ||
    (account.accountNumber ?? '').toLowerCase().includes(term)
  )
}

const errorBody = (
  code: string,
  message: string,
): { error: { code: string; message: string; requestId: string } } => ({
  error: { code, message, requestId: 'req_test000000001' },
})

/**
 * Contract-shaped mock API server for `/api/accounts`, mirroring the
 * envelopes defined by `packages/shared` and documented in
 * `salesforce-account-app-technical-implementation.md`. This lets frontend
 * tests run without the real API (Milestone 4/5) or a real Cognito pool.
 */
export const createAccountsHandlers = (state: MockAccountsState) => [
  http.get('*/api/accounts', ({ request }) => {
    const authorization = request.headers.get('Authorization')
    if (authorization === null || !authorization.startsWith('Bearer ')) {
      return HttpResponse.json(
        errorBody('UNAUTHORIZED', 'Missing bearer token.'),
        { status: 401 },
      )
    }

    const url = new URL(request.url)
    const search = url.searchParams.get('search') ?? ''
    const cursor = url.searchParams.get('cursor')

    const filtered =
      search === ''
        ? state.accounts
        : state.accounts.filter((account) => matchesSearch(account, search))

    const startIndex = cursor !== null ? Number(cursor) : 0
    const page = filtered.slice(startIndex, startIndex + PAGE_SIZE)
    const nextIndex = startIndex + PAGE_SIZE
    const hasMore = nextIndex < filtered.length

    return HttpResponse.json({
      data: page,
      meta: {
        pageSize: PAGE_SIZE,
        hasMore,
        nextCursor: hasMore ? String(nextIndex) : null,
      },
    })
  }),

  http.post('*/api/accounts', async ({ request }) => {
    const body = (await request.json()) as CreateAccountInput
    const id = `001${String(state.accounts.length + 1).padStart(12, '0')}`
    const now = new Date().toISOString()
    const account: Account = {
      id,
      name: body.name,
      accountNumber: body.accountNumber ?? null,
      type: body.type ?? null,
      parentId: body.parentId ?? null,
      industry: body.industry ?? null,
      annualRevenue: body.annualRevenue ?? null,
      numberOfEmployees: body.numberOfEmployees ?? null,
      ownership: body.ownership ?? null,
      rating: body.rating ?? null,
      phone: body.phone ?? null,
      fax: body.fax ?? null,
      website: body.website ?? null,
      description: body.description ?? null,
      billingStreet: body.billingStreet ?? null,
      billingCity: body.billingCity ?? null,
      billingState: body.billingState ?? null,
      billingPostalCode: body.billingPostalCode ?? null,
      billingCountry: body.billingCountry ?? null,
      shippingStreet: body.shippingStreet ?? null,
      shippingCity: body.shippingCity ?? null,
      shippingState: body.shippingState ?? null,
      shippingPostalCode: body.shippingPostalCode ?? null,
      shippingCountry: body.shippingCountry ?? null,
      createdDate: now,
      lastModifiedDate: now,
    }
    state.accounts = [account, ...state.accounts]
    return HttpResponse.json(
      { data: { id: account.id, name: account.name } },
      { status: 201 },
    )
  }),

  http.patch('*/api/accounts/:id', async ({ request, params }) => {
    const id = String(params.id)
    const ifUnmodifiedSince = request.headers.get('If-Unmodified-Since')

    if (
      ifUnmodifiedSince === null ||
      Number.isNaN(Date.parse(ifUnmodifiedSince))
    ) {
      return HttpResponse.json(
        errorBody('PRECONDITION_REQUIRED', 'If-Unmodified-Since is required.'),
        { status: 428 },
      )
    }

    const existing = state.accounts.find((account) => account.id === id)
    if (existing === undefined) {
      return HttpResponse.json(
        errorBody('ACCOUNT_NOT_FOUND', 'Account not found.'),
        { status: 404 },
      )
    }

    const suppliedTimestamp = Date.parse(ifUnmodifiedSince)
    const existingTimestamp = Date.parse(existing.lastModifiedDate)
    if (existingTimestamp > suppliedTimestamp) {
      return HttpResponse.json(
        errorBody(
          'PRECONDITION_FAILED',
          'Account changed since it was loaded.',
        ),
        { status: 412 },
      )
    }

    const body = (await request.json()) as UpdateAccountInput
    const updated: Account = {
      ...existing,
      ...body,
      lastModifiedDate: new Date().toISOString(),
    } as Account
    state.accounts = state.accounts.map((account) =>
      account.id === id ? updated : account,
    )

    return HttpResponse.json({ data: { id, updated: true } })
  }),

  http.delete('*/api/accounts/:id', ({ params }) => {
    const id = String(params.id)
    const exists = state.accounts.some((account) => account.id === id)
    if (!exists) {
      return HttpResponse.json(
        errorBody('ACCOUNT_NOT_FOUND', 'Account not found.'),
        { status: 404 },
      )
    }
    state.accounts = state.accounts.filter((account) => account.id !== id)
    return new HttpResponse(null, { status: 204 })
  }),
]
