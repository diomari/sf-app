import type { PublicErrorCode } from '@salesforce-account-app/shared'

export interface SalesforceLogEvent {
  event: 'token_acquired' | 'token_refresh_after_401' | 'request_failed'
  status?: number
  code?: PublicErrorCode
}

export interface SalesforceLogger {
  info(event: SalesforceLogEvent): void
  warn(event: SalesforceLogEvent): void
}

export const createNoopSalesforceLogger = (): SalesforceLogger => ({
  info: () => undefined,
  warn: () => undefined,
})
