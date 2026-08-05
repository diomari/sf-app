/**
 * Public frontend configuration only. Every value here is read from
 * `VITE_*` environment variables and must never contain a secret — see
 * `.env.example` and SECURITY.md ("Frontend `VITE_*` values may contain
 * only public Cognito/API configuration.").
 */

export interface AppConfig {
  apiBaseUrl: string
  cognito: {
    userPoolId: string
    clientId: string
    domain: string
    redirectUri: string
    logoutUri: string
    scope: string
    region: string
  }
}

const readEnv = (key: string): string => {
  const value = (import.meta.env as Record<string, string | undefined>)[key]
  return typeof value === 'string' ? value.trim() : ''
}

const deriveRegionFromUserPoolId = (userPoolId: string): string => {
  const [region] = userPoolId.split('_')
  return region ?? ''
}

const normalizeDomain = (domain: string): string => {
  if (domain === '') {
    return ''
  }
  return domain.startsWith('http://') || domain.startsWith('https://')
    ? domain
    : `https://${domain}`
}

export const loadConfig = (): AppConfig => {
  const userPoolId = readEnv('VITE_COGNITO_USER_POOL_ID')

  return {
    apiBaseUrl: readEnv('VITE_API_BASE_URL') || '/api',
    cognito: {
      userPoolId,
      clientId: readEnv('VITE_COGNITO_CLIENT_ID'),
      domain: normalizeDomain(readEnv('VITE_COGNITO_DOMAIN')),
      redirectUri: readEnv('VITE_COGNITO_REDIRECT_URI'),
      logoutUri: readEnv('VITE_COGNITO_LOGOUT_URI'),
      scope: readEnv('VITE_COGNITO_SCOPE') || 'openid',
      region: deriveRegionFromUserPoolId(userPoolId),
    },
  }
}

const PLACEHOLDER_PREFIX = 'replace-with-'

const isPlaceholder = (value: string): boolean =>
  value === '' || value.toLowerCase().includes(PLACEHOLDER_PREFIX)

export const isCognitoConfigured = (config: AppConfig): boolean =>
  !isPlaceholder(config.cognito.userPoolId) &&
  !isPlaceholder(config.cognito.clientId) &&
  !isPlaceholder(config.cognito.domain) &&
  config.cognito.region !== '' &&
  config.cognito.redirectUri !== '' &&
  config.cognito.logoutUri !== ''
