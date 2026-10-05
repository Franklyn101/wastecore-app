import * as SecureStore from "expo-secure-store"
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { Platform } from "react-native"
import { api, setAuthToken, setUnauthorizedHandler, type AuthResponse } from "./api"
import type { User } from "./types"

const TOKEN_KEY = "wastecore.token"

// SecureStore keeps the token in the iOS Keychain / Android Keystore.
// It has no web implementation, so the web build falls back to localStorage.
const tokenStore = {
  get: () => (Platform.OS === "web" ? Promise.resolve(localStorage.getItem(TOKEN_KEY)) : SecureStore.getItemAsync(TOKEN_KEY)),
  set: (token: string) =>
    Platform.OS === "web" ? Promise.resolve(localStorage.setItem(TOKEN_KEY, token)) : SecureStore.setItemAsync(TOKEN_KEY, token),
  clear: () =>
    Platform.OS === "web" ? Promise.resolve(localStorage.removeItem(TOKEN_KEY)) : SecureStore.deleteItemAsync(TOKEN_KEY),
}

type AuthState = {
  user: User | null
  loading: boolean
  signIn: (phone: string, password: string) => Promise<void>
  signUp: (name: string, phone: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  setUser: (user: User) => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const signOut = useCallback(async () => {
    setAuthToken(null)
    setUser(null)
    await tokenStore.clear()
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(() => void signOut())
    ;(async () => {
      try {
        const token = await tokenStore.get()
        if (token) {
          setAuthToken(token)
          setUser((await api.me()).user)
        }
      } catch {
        // Expired token or offline: start signed out; the user can sign in again.
        setAuthToken(null)
      } finally {
        setLoading(false)
      }
    })()
    return () => setUnauthorizedHandler(null)
  }, [signOut])

  const accept = useCallback(async ({ token, user }: AuthResponse) => {
    await tokenStore.set(token)
    setAuthToken(token)
    setUser(user)
  }, [])

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      signIn: async (phone, password) => accept(await api.login({ phone, password })),
      signUp: async (name, phone, password) => accept(await api.register({ name, phone, password })),
      signOut,
      setUser,
    }),
    [user, loading, accept, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider")
  return ctx
}
