import { z } from 'zod'

import { AppError } from '../errors/app-error.js'
import { assertAllowedSalesforceHost } from './host-allowlist.js'

export const salesforceSecretSchema = z
  .object({
    clientId: z.string().min(1),
    clientSecret: z.string().min(1),
    loginUrl: z.string().min(1),
    cursorSigningKey: z.string().min(1),
  })
  .strict()

export type SalesforceSecret = z.infer<typeof salesforceSecretSchema>

export interface SecretsProviderDependencies {
  secretArn: string
  fetchSecret: (secretArn: string) => Promise<string>
}

export interface SecretsProvider {
  getSecret: () => Promise<SalesforceSecret>
}

const throwMalformedSecret = (): never => {
  throw new AppError(
    500,
    'INTERNAL_ERROR',
    'Salesforce integration secret is invalid.',
  )
}

const parseSecret = (raw: string): SalesforceSecret => {
  let candidate: unknown
  try {
    candidate = JSON.parse(raw) as unknown
  } catch {
    return throwMalformedSecret()
  }

  const result = salesforceSecretSchema.safeParse(candidate)
  if (!result.success) {
    return throwMalformedSecret()
  }

  assertAllowedSalesforceHost(result.data.loginUrl)

  return result.data
}

export const createSecretsProvider = (
  dependencies: SecretsProviderDependencies,
): SecretsProvider => {
  let cachedSecret: Promise<SalesforceSecret> | undefined

  const getSecret = (): Promise<SalesforceSecret> => {
    if (cachedSecret === undefined) {
      cachedSecret = dependencies
        .fetchSecret(dependencies.secretArn)
        .then(parseSecret)
        .catch((error: unknown) => {
          cachedSecret = undefined
          throw error
        })
    }

    return cachedSecret
  }

  return { getSecret }
}
