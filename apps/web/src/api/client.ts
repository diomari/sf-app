import {
  accountPageSchema,
  createAccountInputSchema,
  createAccountResponseSchema,
  errorResponseSchema,
  updateAccountInputSchema,
  updateAccountResponseSchema,
  type AccountPage,
  type CreateAccountInput,
  type CreateAccountResponse,
  type PublicErrorCode,
  type UpdateAccountInput,
  type UpdateAccountResponse,
} from '@salesforce-account-app/shared'

/** Typed client-side error mapped from the shared error envelope. */
export class ApiClientError extends Error {
  readonly code: PublicErrorCode
  readonly status: number
  readonly requestId: string | null

  constructor(
    code: PublicErrorCode,
    status: number,
    message: string,
    requestId: string | null,
  ) {
    super(message)
    this.name = 'ApiClientError'
    this.code = code
    this.status = status
    this.requestId = requestId
  }
}

export type CreateAccountResult = CreateAccountResponse['data']
export type UpdateAccountResult = UpdateAccountResponse['data']

export interface ListAccountsParams {
  search?: string | undefined
  cursor?: string | undefined
  signal?: AbortSignal | undefined
}

export interface ApiClientOptions {
  baseUrl: string
  getAccessToken: () => string | null
  /** Called whenever a request fails with 401, so the app can prompt re-auth. */
  onUnauthorized?: (() => void) | undefined
}

const REQUEST_TIMEOUT_MS = 15_000

export class ApiClient {
  private readonly baseUrl: string
  private readonly getAccessToken: () => string | null
  private readonly onUnauthorized: (() => void) | undefined

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '')
    this.getAccessToken = options.getAccessToken
    this.onUnauthorized = options.onUnauthorized
  }

  async listAccounts(params: ListAccountsParams = {}): Promise<AccountPage> {
    const query = new URLSearchParams()
    if (params.search !== undefined && params.search !== '') {
      query.set('search', params.search)
    }
    if (params.cursor !== undefined && params.cursor !== '') {
      query.set('cursor', params.cursor)
    }
    const queryString = query.toString()
    const path =
      queryString.length > 0 ? `/accounts?${queryString}` : '/accounts'

    const body = await this.request(path, { method: 'GET' }, params.signal)
    return accountPageSchema.parse(body)
  }

  async createAccount(
    input: CreateAccountInput,
    signal?: AbortSignal,
  ): Promise<CreateAccountResult> {
    const payload = createAccountInputSchema.parse(input)
    const body = await this.request(
      '/accounts',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      signal,
    )
    return createAccountResponseSchema.parse(body).data
  }

  async updateAccount(
    id: string,
    input: UpdateAccountInput,
    ifUnmodifiedSince: string,
    signal?: AbortSignal,
  ): Promise<UpdateAccountResult> {
    const payload = updateAccountInputSchema.parse(input)
    const body = await this.request(
      `/accounts/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'If-Unmodified-Since': ifUnmodifiedSince,
        },
        body: JSON.stringify(payload),
      },
      signal,
    )
    return updateAccountResponseSchema.parse(body).data
  }

  async deleteAccount(id: string, signal?: AbortSignal): Promise<void> {
    await this.request(
      `/accounts/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
      signal,
    )
  }

  private async request(
    path: string,
    init: RequestInit,
    externalSignal: AbortSignal | undefined,
  ): Promise<unknown> {
    const accessToken = this.getAccessToken()
    if (accessToken === null) {
      this.onUnauthorized?.()
      throw new ApiClientError(
        'UNAUTHORIZED',
        401,
        'You are signed out. Sign in again to continue.',
        null,
      )
    }

    const timeoutController = new AbortController()
    const timeoutId = setTimeout(
      () => timeoutController.abort(),
      REQUEST_TIMEOUT_MS,
    )
    const signal = externalSignal
      ? anySignal([externalSignal, timeoutController.signal])
      : timeoutController.signal

    let response: Response
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal,
        headers: {
          ...init.headers,
          Accept: 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
      })
    } catch (caughtError) {
      throw new ApiClientError(
        'INTEGRATION_UNAVAILABLE',
        0,
        caughtError instanceof Error && caughtError.name === 'AbortError'
          ? 'The request timed out. Please try again.'
          : 'Unable to reach the server. Please try again.',
        null,
      )
    } finally {
      clearTimeout(timeoutId)
    }

    if (response.status === 204) {
      return null
    }

    const text = await response.text()
    const json: unknown = text.length > 0 ? JSON.parse(text) : null

    if (!response.ok) {
      if (response.status === 401) {
        this.onUnauthorized?.()
      }

      const parsedError = errorResponseSchema.safeParse(json)
      if (parsedError.success) {
        throw new ApiClientError(
          parsedError.data.error.code,
          response.status,
          parsedError.data.error.message,
          parsedError.data.error.requestId,
        )
      }

      throw new ApiClientError(
        'INTERNAL_ERROR',
        response.status,
        'Something went wrong. Please try again.',
        null,
      )
    }

    return json
  }
}

const anySignal = (signals: AbortSignal[]): AbortSignal => {
  const controller = new AbortController()
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort()
      break
    }
    signal.addEventListener('abort', () => controller.abort(), {
      once: true,
    })
  }
  return controller.signal
}
