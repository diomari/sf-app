import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'

import { AccountsPage } from './accounts/AccountsPage.js'
import { ApiClient } from './api/client.js'
import { useAuth } from './auth/AuthContext.js'
import { AUTH_CALLBACK_PATH } from './auth/oidcConfig.js'
import { loadConfig } from './config.js'

const Shell = ({ children }: { children: ReactNode }) => (
  <main className="shell">
    <section aria-labelledby="app-title" className="card">
      <p className="eyebrow">Salesforce Account Management</p>
      <h1 id="app-title">Salesforce Account Management</h1>
      {children}
    </section>
  </main>
)

export const App = () => {
  const auth = useAuth()
  const [sessionExpired, setSessionExpired] = useState(false)

  const config = useMemo(() => loadConfig(), [])
  const apiClient = useMemo(
    () =>
      new ApiClient({
        baseUrl: config.apiBaseUrl,
        getAccessToken: auth.getAccessToken,
        onUnauthorized: () => setSessionExpired(true),
      }),
    [config.apiBaseUrl, auth.getAccessToken],
  )

  if (auth.status === 'unconfigured') {
    return (
      <Shell>
        <p>
          Cognito is not configured yet. Set the <code>VITE_COGNITO_*</code>{' '}
          variables described in <code>.env.example</code> to enable sign in.
        </p>
      </Shell>
    )
  }

  if (window.location.pathname === AUTH_CALLBACK_PATH) {
    return (
      <Shell>
        <p role="status">Completing sign-in…</p>
      </Shell>
    )
  }

  if (auth.status === 'initializing') {
    return (
      <Shell>
        <p role="status">Loading…</p>
      </Shell>
    )
  }

  if (auth.status === 'error') {
    return (
      <Shell>
        <p role="alert">{auth.errorMessage ?? 'Sign-in failed.'}</p>
        <button type="button" onClick={() => void auth.signIn()}>
          Try again
        </button>
      </Shell>
    )
  }

  if (
    auth.status === 'signedOut' ||
    auth.status === 'expired' ||
    sessionExpired
  ) {
    return (
      <Shell>
        <p>
          {sessionExpired || auth.status === 'expired'
            ? 'Your session has expired. Sign in again to continue.'
            : 'Sign in with your Cognito account to manage Salesforce Accounts.'}
        </p>
        <button
          type="button"
          onClick={() => {
            setSessionExpired(false)
            void auth.signIn()
          }}
        >
          Sign in
        </button>
      </Shell>
    )
  }

  return (
    <main className="shell app-shell">
      <header className="app-header">
        <p className="eyebrow">Salesforce Account Management</p>
        <button type="button" onClick={() => void auth.signOut()}>
          Sign out
        </button>
      </header>
      <AccountsPage apiClient={apiClient} />
    </main>
  )
}
