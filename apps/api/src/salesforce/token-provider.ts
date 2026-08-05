import { z } from 'zod'

import { AppError } from '../errors/app-error.js'
import {
  DEFAULT_TOKEN_TTL_SECONDS,
  TOKEN_EXPIRY_SKEW_MS,
} from './config.js'
import { assertAllowedSalesforceHost } from './host-allowlist.js'
import type { BoundedFetch } from './http-client.js'
import { createNoopSalesforceLogger, type SalesforceLogger } from './logger.js'
import type { SalesforceSecret } from './secrets-provider.js'

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  instance_url: z.string().min(1),
  token_type: z.string().min(1),
  expires_in: z.number().positive().optional(),
})

export interface CachedSalesforceToken {
  accessToken: string
  instanceUrl: string
  expiresAt: number
}

export interface GetTokenOptions {
  forceRefresh?: boolean
}

export interface TokenProvider {
  getToken: (options?: GetTokenOptions) => Promise<CachedSalesforceToken>
}

export interface TokenProviderDependencies {
  boundedFetch: BoundedFetch
  getSecret: () => Promise<SalesforceSecret>
  logger?: SalesforceLogger
  now?: () => number
  skewMs?: number
  defaultTtlSeconds?: number
}

const throwAuthenticationFailed = (): never => {
  throw new AppError(
    502,
    'INTEGRATION_UNAVAILABLE',
    'Unable to authenticate with Salesforce.',
  )
}

export const createTokenProvider = (
  dependencies: TokenProviderDependencies,
): TokenProvider => {
  const now = dependencies.now ?? Date.now
  const skewMs = dependencies.skewMs ?? TOKEN_EXPIRY_SKEW_MS
  const defaultTtlSeconds =
    dependencies.defaultTtlSeconds ?? DEFAULT_TOKEN_TTL_SECONDS
  const logger = dependencies.logger ?? createNoopSalesforceLogger()

  let cachedToken: CachedSalesforceToken | undefined
  let inflight: Promise<CachedSalesforceToken> | undefined

  const acquireToken = async (): Promise<CachedSalesforceToken> => {
    const secret = await dependencies.getSecret()
    const loginUrl = assertAllowedSalesforceHost(secret.loginUrl)
    const tokenUrl = new URL('/services/oauth2/token', loginUrl).toString()

    const requestBody = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: secret.clientId,
      client_secret: secret.clientSecret,
    })

    const response = await dependencies.boundedFetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: requestBody.toString(),
    })

    if (!response.ok) {
      await response.text().catch(() => undefined)
      return throwAuthenticationFailed()
    }

    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      return throwAuthenticationFailed()
    }

    const parsed = tokenResponseSchema.safeParse(payload)
    if (!parsed.success) {
      return throwAuthenticationFailed()
    }

    const instanceUrl = assertAllowedSalesforceHost(parsed.data.instance_url)
    const ttlMs = (parsed.data.expires_in ?? defaultTtlSeconds) * 1000

    logger.info({ event: 'token_acquired' })

    return {
      accessToken: parsed.data.access_token,
      instanceUrl: instanceUrl.toString(),
      expiresAt: now() + ttlMs,
    }
  }

  const isFresh = (token: CachedSalesforceToken): boolean =>
    token.expiresAt - skewMs > now()

  const getToken = (
    options: GetTokenOptions = {},
  ): Promise<CachedSalesforceToken> => {
    if (
      options.forceRefresh !== true &&
      cachedToken !== undefined &&
      isFresh(cachedToken)
    ) {
      return Promise.resolve(cachedToken)
    }

    if (inflight !== undefined) {
      return inflight
    }

    const acquisition = acquireToken()
      .then((token) => {
        cachedToken = token
        return token
      })
      .finally(() => {
        inflight = undefined
      })

    inflight = acquisition
    return acquisition
  }

  return { getToken }
}
