import AsyncStorage from "@react-native-async-storage/async-storage"
import { useEffect, useState } from "react"
import { AppState } from "react-native"
import { api, ApiError, type CompleteJob } from "./api"
import type { CollectorJob, CollectorJobs } from "./types"

// Collectors often work with weak signal. Their job list is kept on the phone, and
// what they do on a job (on my way, done, not done) is queued and sent when the
// connection comes back.

const JOBS_KEY = "wc.collector.jobs"
const QUEUE_KEY = "wc.collector.queue"

export type QueuedAction =
  | { id: string; jobId: string; kind: "onTheWay"; queuedAt: string }
  | { id: string; jobId: string; kind: "complete"; input: CompleteJob; queuedAt: string }
  | { id: string; jobId: string; kind: "incomplete"; reason: string; wastedTrip?: boolean; queuedAt: string }

/** Distributes Omit over the union, so each action keeps its own fields. */
type NewAction = QueuedAction extends infer A ? (A extends QueuedAction ? Omit<A, "id" | "queuedAt"> : never) : never

const isOffline = (e: unknown) => e instanceof ApiError && e.status === 0

async function read<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

async function write(key: string, value: unknown) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage full or unavailable: the app still works online.
  }
}

/** The job list, from the server when possible, otherwise the last copy saved on the phone. */
export async function loadJobs(): Promise<CollectorJobs & { offline: boolean; savedAt?: string }> {
  try {
    const jobs = await api.collector.jobs()
    await write(JOBS_KEY, { ...jobs, savedAt: new Date().toISOString() })
    return { ...applyQueued(jobs, await pending()), offline: false }
  } catch (e) {
    const saved = await read<(CollectorJobs & { savedAt: string }) | null>(JOBS_KEY, null)
    if (!isOffline(e) || !saved) throw e
    return { ...applyQueued(saved, await pending()), offline: true }
  }
}

/** One job, from the server or from the saved list. */
export async function loadJob(id: string): Promise<{ job: CollectorJob; offline: boolean }> {
  try {
    return { ...(await api.collector.job(id)), offline: false }
  } catch (e) {
    const saved = await read<CollectorJobs | null>(JOBS_KEY, null)
    const job = saved && [...saved.open, ...saved.history].find((j) => j.id === id)
    if (!isOffline(e) || !job) throw e
    const queued = (await pending()).filter((a) => a.jobId === id)
    return { job: queued.reduce(applyAction, job), offline: true }
  }
}

export const pending = () => read<QueuedAction[]>(QUEUE_KEY, [])

/** Shows queued actions on the saved jobs, so a job marked done offline looks done. */
function applyQueued(jobs: CollectorJobs, queue: QueuedAction[]): CollectorJobs {
  if (queue.length === 0) return jobs
  const open: CollectorJob[] = []
  const history = [...jobs.history]
  for (const job of jobs.open) {
    const updated = queue.filter((a) => a.jobId === job.id).reduce(applyAction, job)
    if (updated.status === "ASSIGNED") open.push(updated)
    else history.unshift(updated)
  }
  return { ...jobs, open, history }
}

function applyAction(job: CollectorJob, action: QueuedAction): CollectorJob {
  if (action.kind === "onTheWay") return { ...job, onTheWayAt: job.onTheWayAt ?? action.queuedAt }
  if (action.kind === "complete") {
    return { ...job, status: "COMPLETED", completedAt: action.queuedAt, collectorNote: action.input.note ?? null, bagsCollected: action.input.bags ?? job.bagsCollected }
  }
  return { ...job, status: "INCOMPLETE", completedAt: action.queuedAt, collectorNote: action.reason }
}

const listeners = new Set<(count: number) => void>()
const announce = (count: number) => listeners.forEach((l) => l(count))

/**
 * Sends the action now, or queues it if there's no connection.
 * Returns the updated job, marked `queued` when it's waiting to be sent.
 */
export async function runOrQueue(job: CollectorJob, action: NewAction): Promise<{ job: CollectorJob; queued: boolean }> {
  const queue = await pending()
  // Keep actions in order: if something for this phone is already waiting, wait behind it.
  if (queue.length === 0) {
    try {
      return { job: (await send(action)).job, queued: false }
    } catch (e) {
      if (!isOffline(e)) throw e
    }
  }
  const queued = { ...action, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, queuedAt: new Date().toISOString() } as QueuedAction
  await write(QUEUE_KEY, [...queue, queued])
  announce(queue.length + 1)
  return { job: applyAction(job, queued), queued: true }
}

function send(action: NewAction | QueuedAction) {
  if (action.kind === "onTheWay") return api.collector.onTheWay(action.jobId)
  if (action.kind === "complete") return api.collector.complete(action.jobId, action.input)
  return api.collector.incomplete(action.jobId, action.reason, action.wastedTrip)
}

let flushing: Promise<{ sent: number; failed: string[] }> | null = null

/** Sends queued actions in order. Stops at the first network failure; drops ones the server refuses. */
export function flushQueue() {
  flushing ??= (async () => {
    let sent = 0
    const failed: string[] = []
    try {
      let queue = await pending()
      while (queue.length) {
        const [next, ...rest] = queue
        try {
          await send(next)
          sent++
        } catch (e) {
          if (isOffline(e)) break
          // e.g. the office reassigned the job meanwhile. Nothing to retry.
          failed.push((e as Error).message)
        }
        queue = rest
        await write(QUEUE_KEY, queue)
        announce(queue.length)
      }
    } finally {
      flushing = null
    }
    return { sent, failed }
  })()
  return flushing
}

/** How many actions are waiting to be sent. Retries every 30 seconds and when the app comes back. */
export function useOfflineQueue(onFlushed?: (result: { sent: number; failed: string[] }) => void) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    void pending().then((q) => setCount(q.length))
    listeners.add(setCount)
    const tryFlush = () =>
      void pending().then((q) => {
        if (q.length) void flushQueue().then((r) => (r.sent || r.failed.length) && onFlushed?.(r))
      })
    tryFlush()
    const timer = setInterval(tryFlush, 30_000)
    const sub = AppState.addEventListener("change", (s) => s === "active" && tryFlush())
    return () => {
      listeners.delete(setCount)
      clearInterval(timer)
      sub.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return count
}
