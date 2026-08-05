import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, vi } from 'vitest'

import { resetMockState, server } from './msw/server.js'

// Clearly-fake placeholder values only — no real Cognito pool exists yet.
// See `.env.example` for the shape these VITE_* variables must take.
vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test/api')
vi.stubEnv('VITE_COGNITO_USER_POOL_ID', 'ap-southeast-1_fakePool01')
vi.stubEnv('VITE_COGNITO_CLIENT_ID', 'fake-app-client-0123456789')
vi.stubEnv(
  'VITE_COGNITO_DOMAIN',
  'fake-app.auth.ap-southeast-1.amazoncognito.com',
)
vi.stubEnv('VITE_COGNITO_REDIRECT_URI', 'http://localhost:5173/auth/callback')
vi.stubEnv('VITE_COGNITO_LOGOUT_URI', 'http://localhost:5173/')
vi.stubEnv('VITE_COGNITO_SCOPE', 'openid email accounts-api/access')

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))

afterEach(() => {
  cleanup()
  server.resetHandlers()
  resetMockState()
})

afterAll(() => server.close())
