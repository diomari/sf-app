import type { User } from 'oidc-client-ts'
import { UserManager } from 'oidc-client-ts'
import type { ReactNode } from 'react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { loadConfig, isCognitoConfigured } from '../config.js'
import { AUTH_CALLBACK_PATH, buildUserManagerSettings } from './oidcConfig.js'

export type AuthStatus =
  | 'unconfigured'
  | 'initializing'
  | 'signedOut'
  | 'signedIn'
  | 'expired'
  | 'error'

export interface AuthContextValue {
  status: AuthStatus
  user: User | null
  errorMessage: string | null
  signIn: () => Promise<void>
  signOut: () => Promise<void>
  /** Stable accessor used by the API client; always reflects the latest token. */
  getAccessToken: () => string | null
}

const AuthContext = createContext<AuthContextValue | null>(null)

const stripAuthResponseFromUrl = (): void => {
  const cleanUrl = `${window.location.origin}/`
  window.history.replaceState({}, document.title, cleanUrl)
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const config = useMemo(() => loadConfig(), [])
  const configured = useMemo(() => isCognitoConfigured(config), [config])

  const userManager = useMemo(() => {
    if (!configured) {
      return null
    }
    return new UserManager(buildUserManagerSettings(config))
  }, [config, configured])

  const [status, setStatus] = useState<AuthStatus>(
    configured ? 'initializing' : 'unconfigured',
  )
  const [user, setUser] = useState<User | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const userRef = useRef<User | null>(null)
  userRef.current = user

  const getAccessToken = useCallback((): string | null => {
    const current = userRef.current
    if (current === null || current.expired) {
      return null
    }
    return current.access_token
  }, [])

  const signIn = useCallback(async (): Promise<void> => {
    if (userManager === null) {
      return
    }
    await userManager.signinRedirect()
  }, [userManager])

  const signOut = useCallback(async (): Promise<void> => {
    if (userManager === null) {
      return
    }
    await userManager.removeUser()
    await userManager.signoutRedirect()
  }, [userManager])

  useEffect(() => {
    if (userManager === null) {
      return
    }

    let cancelled = false

    const onUserLoaded = (loadedUser: User) => {
      if (cancelled) return
      setUser(loadedUser)
      setStatus(loadedUser.expired ? 'expired' : 'signedIn')
    }

    const onUserUnloaded = () => {
      if (cancelled) return
      setUser(null)
      setStatus('signedOut')
    }

    const onAccessTokenExpired = () => {
      if (cancelled) return
      setStatus('expired')
    }

    const onUserSignedOut = () => {
      if (cancelled) return
      setUser(null)
      setStatus('signedOut')
    }

    userManager.events.addUserLoaded(onUserLoaded)
    userManager.events.addUserUnloaded(onUserUnloaded)
    userManager.events.addAccessTokenExpired(onAccessTokenExpired)
    userManager.events.addUserSignedOut(onUserSignedOut)

    const initialize = async () => {
      try {
        if (window.location.pathname === AUTH_CALLBACK_PATH) {
          const callbackUser = await userManager.signinRedirectCallback()
          stripAuthResponseFromUrl()
          if (cancelled) return
          setUser(callbackUser)
          setStatus(callbackUser.expired ? 'expired' : 'signedIn')
          return
        }

        const existingUser = await userManager.getUser()
        if (cancelled) return

        if (existingUser !== null && !existingUser.expired) {
          setUser(existingUser)
          setStatus('signedIn')
        } else {
          setUser(null)
          setStatus('signedOut')
        }
      } catch (caughtError) {
        if (cancelled) return
        setErrorMessage(
          caughtError instanceof Error
            ? caughtError.message
            : 'Authentication failed.',
        )
        setStatus('error')
      }
    }

    void initialize()

    return () => {
      cancelled = true
      userManager.events.removeUserLoaded(onUserLoaded)
      userManager.events.removeUserUnloaded(onUserUnloaded)
      userManager.events.removeAccessTokenExpired(onAccessTokenExpired)
      userManager.events.removeUserSignedOut(onUserSignedOut)
    }
  }, [userManager])

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, errorMessage, signIn, signOut, getAccessToken }),
    [status, user, errorMessage, signIn, signOut, getAccessToken],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext)
  if (context === null) {
    throw new Error('useAuth must be used within an AuthProvider.')
  }
  return context
}
