import { AppError } from '../errors/app-error.js'

export const SALESFORCE_REQUEST_TIMEOUT_MS = 10_000

export const TOKEN_EXPIRY_SKEW_MS = 60_000

export const DEFAULT_TOKEN_TTL_SECONDS = 15 * 60

export interface SalesforceEnvironmentConfig {
  secretArn: string
}

export const readSalesforceEnvironmentConfig = (
  env: Record<string, string | undefined> = process.env,
): SalesforceEnvironmentConfig => {
  const secretArn = env['SALESFORCE_SECRET_ARN']
  if (secretArn === undefined || secretArn.trim().length === 0) {
    throw new AppError(
      500,
      'INTERNAL_ERROR',
      'Salesforce integration is not configured.',
    )
  }

  return { secretArn }
}
