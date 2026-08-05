import type { UserManagerSettings } from 'oidc-client-ts'
import { WebStorageStateStore } from 'oidc-client-ts'

import type { AppConfig } from '../config.js'

/**
 * D-10: browser token storage is memory/session-oriented via a reviewed
 * OIDC library — never `localStorage`. `sessionStorage` is cleared when the
 * tab/browser session ends, which satisfies the session-oriented control.
 */
export const buildUserManagerSettings = (
  config: AppConfig,
): UserManagerSettings => {
  const issuer = `https://cognito-idp.${config.cognito.region}.amazonaws.com/${config.cognito.userPoolId}`
  const domain = config.cognito.domain

  return {
    authority: issuer,
    // Provide metadata directly instead of relying on discovery so the
    // known Cognito Managed Login endpoints are used deterministically
    // (including in tests, without a network fetch).
    metadata: {
      issuer,
      authorization_endpoint: `${domain}/oauth2/authorize`,
      token_endpoint: `${domain}/oauth2/token`,
      userinfo_endpoint: `${domain}/oauth2/userInfo`,
      end_session_endpoint: `${domain}/logout`,
      jwks_uri: `${issuer}/.well-known/jwks.json`,
    },
    client_id: config.cognito.clientId,
    redirect_uri: config.cognito.redirectUri,
    post_logout_redirect_uri: config.cognito.logoutUri,
    response_type: 'code',
    scope: config.cognito.scope,
    loadUserInfo: false,
    automaticSilentRenew: false,
    monitorSession: false,
    revokeTokensOnSignout: true,
    userStore: new WebStorageStateStore({ store: window.sessionStorage }),
    stateStore: new WebStorageStateStore({ store: window.sessionStorage }),
  }
}

export const AUTH_CALLBACK_PATH = '/auth/callback'
