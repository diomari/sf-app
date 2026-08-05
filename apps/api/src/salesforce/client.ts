import type { PublicErrorCode } from '@salesforce-account-app/shared'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

import { AppError } from '../errors/app-error.js'
import type { BoundedFetch } from './http-client.js'
import { createNoopSalesforceLogger, type SalesforceLogger } from './logger.js'
import type { CachedSalesforceToken, TokenProvider } from './token-provider.js'

export interface SalesforceRequestInput {
  method: string
  path: string
  body?: string
  headers?: Record<string, string>
  signal?: AbortSignal
}

export interface SalesforceResponse {
  status: number
  body: unknown
}

export interface SalesforceClient {
  request: (input: SalesforceRequestInput) => Promise<SalesforceResponse>
}

export interface SalesforceClientDependencies {
  boundedFetch: BoundedFetch
  tokenProvider: TokenProvider
  logger?: SalesforceLogger
}

interface UpstreamErrorMapping {
  httpStatus: ContentfulStatusCode
  code: PublicErrorCode
}

const mapUpstreamStatus = (status: number): UpstreamErrorMapping => {
  if (status === 403) {
    return { httpStatus: 403, code: 'INTEGRATION_FORBIDDEN' }
  }
  if (status === 429) {
    return { httpStatus: 429, code: 'RATE_LIMITED' }
  }
  if (status >= 500) {
    return { httpStatus: 502, code: 'INTEGRATION_UNAVAILABLE' }
  }
  return { httpStatus: 400, code: 'SALESFORCE_REJECTED' }
}

export const createSalesforceClient = (
  dependencies: SalesforceClientDependencies,
): SalesforceClient => {
  const logger = dependencies.logger ?? createNoopSalesforceLogger()

  const performRequest = (
    token: CachedSalesforceToken,
    input: SalesforceRequestInput,
  ): Promise<Response> => {
    const url = new URL(input.path, token.instanceUrl).toString()
    return dependencies.boundedFetch(
      url,
      {
        method: input.method,
        headers: {
          Authorization: `Bearer ${token.accessToken}`,
          ...(input.headers ?? {}),
        },
        ...(input.body === undefined ? {} : { body: input.body }),
      },
      input.signal,
    )
  }

  const request = async (
    input: SalesforceRequestInput,
  ): Promise<SalesforceResponse> => {
    const token = await dependencies.tokenProvider.getToken()
    let response = await performRequest(token, input)

    if (response.status === 401) {
      await response.text().catch(() => undefined)
      logger.warn({ event: 'token_refresh_after_401' })
      const refreshedToken = await dependencies.tokenProvider.getToken({
        forceRefresh: true,
      })
      response = await performRequest(refreshedToken, input)
    }

    if (!response.ok) {
      await response.text().catch(() => undefined)
      const mapping = mapUpstreamStatus(response.status)
      logger.warn({
        event: 'request_failed',
        status: response.status,
        code: mapping.code,
      })
      throw new AppError(
        mapping.httpStatus,
        mapping.code,
        'The Salesforce request failed.',
      )
    }

    if (response.status === 204) {
      return { status: response.status, body: undefined }
    }

    const body: unknown = await response.json().catch(() => undefined)
    return { status: response.status, body }
  }

  return { request }
}
