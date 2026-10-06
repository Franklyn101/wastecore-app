import { useFocusEffect } from "expo-router"
import { useCallback, useRef, useState } from "react"

/**
 * Loads data whenever the screen comes into focus, with pull-to-refresh support.
 * Pass a `key` (e.g. the current filter) to reload whenever it changes;
 * responses to older requests are ignored.
 */
export function useFocusData<T>(load: () => Promise<T>, key = "") {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const loadRef = useRef(load)
  loadRef.current = load
  const latest = useRef(0)

  const run = useCallback(async (manual: boolean) => {
    const request = ++latest.current
    if (manual) setRefreshing(true)
    try {
      const result = await loadRef.current()
      if (request !== latest.current) return
      setData(result)
      setError(null)
    } catch (e) {
      if (request === latest.current) setError((e as Error).message)
    } finally {
      if (request === latest.current) setRefreshing(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      void run(false)
    }, [run, key]), // a new key gives a new callback, which re-runs the effect
  )

  return { data, error, refreshing, refresh: () => void run(true), setData }
}
