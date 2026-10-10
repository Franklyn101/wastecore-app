import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react"
import { api } from "./api"
import type { Catalog } from "./types"

type CatalogState = { catalog: Catalog | null; error: string | null; reload: () => void }

const CatalogContext = createContext<CatalogState | null>(null)

/** Loads prices and plans from the server once, so they are never hard-coded in the app. */
export function CatalogProvider({ children }: { children: ReactNode }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(() => {
    setError(null)
    api
      .catalog()
      .then((c) => {
        // An older server doesn't send the pickup prices; say so rather than crash.
        if (!c.pickupPricing) throw new Error("The WasteCore server is out of date. Restart it with: docker compose up --build")
        setCatalog(c)
      })
      .catch((e: Error) => setError(e.message))
  }, [])

  useEffect(reload, [reload])

  return <CatalogContext.Provider value={{ catalog, error, reload }}>{children}</CatalogContext.Provider>
}

export function useCatalog(): CatalogState {
  const ctx = useContext(CatalogContext)
  if (!ctx) throw new Error("useCatalog must be used inside CatalogProvider")
  return ctx
}
