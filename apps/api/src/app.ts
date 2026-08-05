import { Hono } from 'hono'

import type { AppEnvironment } from './lib/environment.js'
import { createConsoleLogger, type Logger } from './lib/logger.js'
import { errorHandler, notFoundHandler } from './middleware/error-handler.js'
import { createRequestContextMiddleware } from './middleware/request-context.js'
import { registerHealthRoute } from './routes/health.js'

export interface AppDependencies {
  createRequestId?: () => string
  logger?: Logger
  now?: () => number
  registerRoutes?: (app: Hono<AppEnvironment>) => void
}

export const createApp = (dependencies: AppDependencies = {}) => {
  const app = new Hono<AppEnvironment>()
  const logger = dependencies.logger ?? createConsoleLogger()

  app.use(
    '*',
    createRequestContextMiddleware({
      logger,
      ...(dependencies.createRequestId === undefined
        ? {}
        : { createRequestId: dependencies.createRequestId }),
      ...(dependencies.now === undefined ? {} : { now: dependencies.now }),
    }),
  )
  app.onError(errorHandler)

  registerHealthRoute(app)
  dependencies.registerRoutes?.(app)
  app.notFound(notFoundHandler)

  return app
}
