import type { ErrorResponse } from '@salesforce-account-app/shared'
import type { Context, ErrorHandler, NotFoundHandler } from 'hono'

import { AppError } from '../errors/app-error.js'
import type { AppEnvironment } from '../lib/environment.js'

const createErrorResponse = (
  context: Context<AppEnvironment>,
  error: AppError,
): Response => {
  const requestId = context.get('requestId')
  const response: ErrorResponse = {
    error: {
      code: error.code,
      message: error.message,
      requestId,
    },
  }

  context.header('Cache-Control', 'no-store')
  context.header('X-Request-Id', requestId)
  return context.json(response, error.status)
}

export const errorHandler: ErrorHandler<AppEnvironment> = (error, context) => {
  const appError =
    error instanceof AppError
      ? error
      : new AppError(500, 'INTERNAL_ERROR', 'An unexpected error occurred.')
  context.set('errorCode', appError.code)
  return createErrorResponse(context, appError)
}

export const notFoundHandler: NotFoundHandler<AppEnvironment> = (context) => {
  const error = new AppError(404, 'ROUTE_NOT_FOUND', 'Route not found.')
  context.set('errorCode', error.code)
  return createErrorResponse(context, error)
}
