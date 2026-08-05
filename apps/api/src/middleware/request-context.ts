import { randomUUID } from 'node:crypto'

import type { MiddlewareHandler } from 'hono'

import type { AppEnvironment } from '../lib/environment.js'
import type { Logger } from '../lib/logger.js'

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/

export interface RequestContextDependencies {
  createRequestId?: () => string
  logger: Logger
  now?: () => number
}

export const createRequestContextMiddleware = (
  dependencies: RequestContextDependencies,
): MiddlewareHandler<AppEnvironment> => {
  const createRequestId = dependencies.createRequestId ?? randomUUID
  const now = dependencies.now ?? Date.now

  return async (context, next) => {
    const candidateRequestId = createRequestId()
    const requestId = REQUEST_ID_PATTERN.test(candidateRequestId)
      ? candidateRequestId
      : randomUUID()
    const startedAt = now()

    context.set('requestId', requestId)
    context.set('requestStartedAt', startedAt)
    context.set('logger', dependencies.logger)
    context.set('errorCode', undefined)

    await next()

    context.header('X-Request-Id', requestId)

    const status = context.res.status
    const errorCode = context.get('errorCode')
    const event = {
      requestId,
      route: context.req.routePath || 'unmatched',
      method: context.req.method,
      durationMs: Math.max(0, now() - startedAt),
      outcome:
        status >= 500
          ? ('server_error' as const)
          : status >= 400
            ? ('client_error' as const)
            : ('success' as const),
      status,
      ...(errorCode === undefined ? {} : { errorCode }),
    }

    if (status >= 500) {
      dependencies.logger.error(event)
    } else {
      dependencies.logger.info(event)
    }
  }
}
