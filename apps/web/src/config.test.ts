import { describe, expect, it, vi } from 'vitest'

import { isCognitoConfigured, loadConfig } from './config.js'

describe('config', () => {
  it('defaults the API base URL to /api when unset', () => {
    vi.stubEnv('VITE_API_BASE_URL', '')
    expect(loadConfig().apiBaseUrl).toBe('/api')
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test/api')
  })

  it('normalizes a bare Cognito domain to an https URL', () => {
    vi.stubEnv(
      'VITE_COGNITO_DOMAIN',
      'my-app.auth.ap-southeast-1.amazoncognito.com',
    )
    const config = loadConfig()
    expect(config.cognito.domain).toBe(
      'https://my-app.auth.ap-southeast-1.amazoncognito.com',
    )
  })

  it('leaves an already-schemed domain untouched', () => {
    vi.stubEnv('VITE_COGNITO_DOMAIN', 'https://already-schemed.example.test')
    const config = loadConfig()
    expect(config.cognito.domain).toBe('https://already-schemed.example.test')
  })

  it('treats placeholder-style values as not configured', () => {
    vi.stubEnv('VITE_COGNITO_USER_POOL_ID', 'replace-with-public-user-pool-id')
    expect(isCognitoConfigured(loadConfig())).toBe(false)
  })

  it('treats fully populated fake values as configured', () => {
    vi.stubEnv('VITE_COGNITO_USER_POOL_ID', 'ap-southeast-1_fakePool01')
    vi.stubEnv('VITE_COGNITO_CLIENT_ID', 'fake-client-id')
    vi.stubEnv(
      'VITE_COGNITO_DOMAIN',
      'fake.auth.ap-southeast-1.amazoncognito.com',
    )
    vi.stubEnv(
      'VITE_COGNITO_REDIRECT_URI',
      'http://localhost:5173/auth/callback',
    )
    vi.stubEnv('VITE_COGNITO_LOGOUT_URI', 'http://localhost:5173/')
    expect(isCognitoConfigured(loadConfig())).toBe(true)
  })
})
