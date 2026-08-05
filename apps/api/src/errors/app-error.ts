import type { PublicErrorCode } from '@salesforce-account-app/shared'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

export class AppError extends Error {
  public readonly code: PublicErrorCode
  public readonly status: ContentfulStatusCode

  public constructor(
    status: ContentfulStatusCode,
    code: PublicErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'AppError'
    this.status = status
    this.code = code
  }
}
