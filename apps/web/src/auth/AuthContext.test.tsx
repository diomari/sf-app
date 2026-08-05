import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Listener = (...args: unknown[]) => void

const listeners = new Map<string, Set<Listener>>()

const on = (event: string, listener: Listener) => {
  const set = listeners.get(event) ?? new Set()
  set.add(listener)
  listeners.set(event, set)
}
const off = (event: string, listener: Listener) => {
  listeners.get(event)?.delete(listener)
}
const emit = (event: string, ...args: unknown[]) => {
  for (const listener of listeners.get(event) ?? []) listener(...args)
}

const fakeUser = {
  access_token: 'fake-access-token',
  expired: false,
  profile: { sub: 'user-1' },
}

const mockUserManager = {
  getUser: vi.fn(),
  signinRedirect: vi.fn().mockResolvedValue(undefined),
  signinRedirectCallback: vi.fn(),
  signoutRedirect: vi.fn().mockResolvedValue(undefined),
  removeUser: vi.fn().mockResolvedValue(undefined),
  events: {
    addUserLoaded: (cb: Listener) => on('userLoaded', cb),
    removeUserLoaded: (cb: Listener) => off('userLoaded', cb),
    addUserUnloaded: (cb: Listener) => on('userUnloaded', cb),
    removeUserUnloaded: (cb: Listener) => off('userUnloaded', cb),
    addAccessTokenExpired: (cb: Listener) => on('accessTokenExpired', cb),
    removeAccessTokenExpired: (cb: Listener) => off('accessTokenExpired', cb),
    addUserSignedOut: (cb: Listener) => on('userSignedOut', cb),
    removeUserSignedOut: (cb: Listener) => off('userSignedOut', cb),
  },
}

vi.mock('oidc-client-ts', () => ({
  // A constructor function that returns the shared mock instance, so
  // `new UserManager(...)` resolves to `mockUserManager`.
  UserManager: vi.fn(function UserManagerMock() {
    return mockUserManager
  }),
  WebStorageStateStore: vi.fn(),
}))

const { AuthProvider, useAuth } = await import('./AuthContext.js')

const TestConsumer = () => {
  const auth = useAuth()
  return (
    <div>
      <p data-testid="status">{auth.status}</p>
      <p data-testid="token">{auth.getAccessToken() ?? 'none'}</p>
      <button type="button" onClick={() => void auth.signIn()}>
        Sign in
      </button>
      <button type="button" onClick={() => void auth.signOut()}>
        Sign out
      </button>
    </div>
  )
}

describe('AuthProvider', () => {
  beforeEach(() => {
    listeners.clear()
    vi.clearAllMocks()
    mockUserManager.getUser.mockResolvedValue(null)
    window.history.pushState({}, '', '/')
  })

  it('starts signed out and redirects to Cognito on sign-in', async () => {
    const user = userEvent.setup()
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    )

    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('signedOut'),
    )

    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(mockUserManager.signinRedirect).toHaveBeenCalledOnce()
  })

  it('processes the OIDC callback, exposes the token, and strips the URL', async () => {
    window.history.pushState({}, '', '/auth/callback?code=abc123&state=xyz')
    mockUserManager.signinRedirectCallback.mockResolvedValue(fakeUser)

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    )

    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('signedIn'),
    )
    expect(screen.getByTestId('token')).toHaveTextContent('fake-access-token')
    expect(window.location.pathname).toBe('/')
    expect(window.location.search).toBe('')
  })

  it('restores an existing session from storage', async () => {
    mockUserManager.getUser.mockResolvedValue(fakeUser)

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    )

    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('signedIn'),
    )
  })

  it('signs out by clearing the local user and redirecting to Cognito logout', async () => {
    mockUserManager.getUser.mockResolvedValue(fakeUser)
    const user = userEvent.setup()

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    )

    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('signedIn'),
    )

    await user.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(mockUserManager.removeUser).toHaveBeenCalledOnce()
    expect(mockUserManager.signoutRedirect).toHaveBeenCalledOnce()
  })

  it('moves to the expired status when the access token expires', async () => {
    mockUserManager.getUser.mockResolvedValue(fakeUser)

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    )

    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('signedIn'),
    )

    emit('accessTokenExpired')

    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('expired'),
    )
  })

  it('surfaces initialization failures as an error status', async () => {
    mockUserManager.getUser.mockRejectedValue(new Error('storage unavailable'))

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    )

    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('error'),
    )
  })

  it('signs out and unloads the user when Cognito reports userUnloaded/userSignedOut', async () => {
    mockUserManager.getUser.mockResolvedValue(fakeUser)

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    )

    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('signedIn'),
    )

    emit('userUnloaded')

    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('signedOut'),
    )
  })

  it('throws when useAuth is used outside an AuthProvider', () => {
    const BareConsumer = () => {
      useAuth()
      return null
    }
    expect(() => render(<BareConsumer />)).toThrow(
      'useAuth must be used within an AuthProvider.',
    )
  })
})
