import type { ReactNode } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { mockState } from '../test/msw/server.js'
import { buildFakeAccount } from '../test/fixtures/accounts.js'
import type { AuthContextValue } from './auth/AuthContext.js'

const authValue: { current: AuthContextValue } = {
  current: {
    status: 'signedOut',
    user: null,
    errorMessage: null,
    signIn: vi.fn(async () => {}),
    signOut: vi.fn(async () => {}),
    getAccessToken: () => null,
  },
}

vi.mock('./auth/AuthContext.js', () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => children,
  useAuth: () => authValue.current,
}))

const { App } = await import('./App.js')

describe('App', () => {
  beforeEach(() => {
    mockState.accounts = [buildFakeAccount()]
    window.history.pushState({}, '', '/')
    authValue.current = {
      status: 'signedOut',
      user: null,
      errorMessage: null,
      signIn: vi.fn(async () => {}),
      signOut: vi.fn(async () => {}),
      getAccessToken: () => null,
    }
  })

  it('never contains a Salesforce endpoint, credential, or token', () => {
    render(<App />)
    expect(document.body.innerHTML).not.toMatch(/clientSecret/i)
    expect(document.body.innerHTML).not.toMatch(/salesforce\.com/i)
    expect(document.body.innerHTML).not.toMatch(/force\.com/i)
  })

  it('shows a loading state while auth is initializing', () => {
    authValue.current = { ...authValue.current, status: 'initializing' }
    render(<App />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading')
  })

  it('prompts sign-in when signed out and calls the OIDC redirect', async () => {
    const user = userEvent.setup()
    render(<App />)

    const signInButton = screen.getByRole('button', { name: 'Sign in' })
    await user.click(signInButton)

    expect(authValue.current.signIn).toHaveBeenCalledOnce()
  })

  it('prompts re-authentication when the session has expired', () => {
    authValue.current = { ...authValue.current, status: 'expired' }
    render(<App />)
    expect(screen.getByText(/session has expired/i)).toBeInTheDocument()
  })

  it('shows a not-configured message when Cognito env vars are placeholders', () => {
    authValue.current = { ...authValue.current, status: 'unconfigured' }
    render(<App />)
    expect(screen.getByText(/Cognito is not configured/)).toBeInTheDocument()
  })

  it('shows a completing sign-in message on the OIDC callback route', () => {
    window.history.pushState({}, '', '/auth/callback?code=abc&state=xyz')
    authValue.current = { ...authValue.current, status: 'initializing' }
    render(<App />)
    expect(screen.getByRole('status')).toHaveTextContent('Completing sign-in')
  })

  it('shows a retry option when authentication errors', async () => {
    authValue.current = {
      ...authValue.current,
      status: 'error',
      errorMessage: 'Something broke.',
    }
    const user = userEvent.setup()
    render(<App />)

    expect(screen.getByRole('alert')).toHaveTextContent('Something broke.')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(authValue.current.signIn).toHaveBeenCalledOnce()
  })

  it('renders the Accounts workspace and can sign out once authenticated', async () => {
    authValue.current = {
      ...authValue.current,
      status: 'signedIn',
      getAccessToken: () => 'fake-access-token',
    }
    const user = userEvent.setup()
    render(<App />)

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Accounts' }),
      ).toBeInTheDocument(),
    )

    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(authValue.current.signOut).toHaveBeenCalledOnce()
  })
})
