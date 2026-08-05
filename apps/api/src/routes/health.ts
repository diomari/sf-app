import type { Hono } from 'hono'

import type { AppEnvironment } from '../lib/environment.js'

export const registerHealthRoute = (app: Hono<AppEnvironment>): void => {
  app.get('/api/health', (context) => {
    context.header('Cache-Control', 'no-store')
    return context.json({ status: 'ok' as const })
  })
}
