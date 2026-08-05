import type { PublicErrorCode } from '@salesforce-account-app/shared'

import type { Logger } from './logger.js'

export interface AppVariables {
  logger: Logger
  requestId: string
  requestStartedAt: number
  errorCode: PublicErrorCode | undefined
}

export interface AppEnvironment {
  Variables: AppVariables
}
