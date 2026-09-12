// "Follow" is a per-browser bookmark list, not a real account feature — this app has no auth,
// same convention as the journal author name elsewhere in the ecosystem (a typed name
// remembered in localStorage, not a login). Good enough for "I want to keep an eye on this
// assembly without re-finding it on the leaderboard every time."
import { useCallback, useSyncExternalStore } from 'react'

const KEY = 'dwmp:followed-assemblies'
const listeners = new Set<() => void>()

function readFromStorage(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

// useSyncExternalStore requires getSnapshot to return a referentially stable value when
// nothing has changed — a fresh `new Set(...)` on every call looks like a new snapshot every
// render and spins into "Maximum update depth exceeded." Cache one instance, only rebuild it
// (and notify) on an actual write.
let cache: Set<string> = readFromStorage()

function write(ids: Set<string>) {
  cache = ids
  try {
    localStorage.setItem(KEY, JSON.stringify([...ids]))
  } catch {
    // localStorage unavailable (private mode, etc.) — following just won't persist this session
  }
  listeners.forEach((l) => l())
}

export function isFollowed(assemblyId: string): boolean {
  return cache.has(assemblyId)
}

export function toggleFollow(assemblyId: string) {
  const next = new Set(cache)
  if (next.has(assemblyId)) next.delete(assemblyId)
  else next.add(assemblyId)
  write(next)
}

function getSnapshot() {
  return cache
}

function subscribe(onChange: () => void) {
  listeners.add(onChange)
  return () => listeners.delete(onChange)
}

/** Re-renders the calling component whenever the followed set changes, anywhere in the app. */
export function useFollowedIds(): Set<string> {
  return useSyncExternalStore(useCallback(subscribe, []), getSnapshot)
}
