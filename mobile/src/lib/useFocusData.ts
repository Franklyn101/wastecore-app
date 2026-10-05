import { useFocusEffect } from "expo-router"
import { useCallback, useRef, useState } from "react"

/** Loads data whenever the screen comes into focus, with pull-to-refresh support. */
export function useFocusData<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const loadRef = useRef(load)
  loadRef.current = load

  const run = useCallback(async (manual: boolean) => {
    if (manual) setRefreshing(true)
    try {
      setData(await loadRef.current())
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setRefreshing(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      void run(false)
    }, [run]),
  )

  return { data, error, refreshing, refresh: () => void run(true) }
}
