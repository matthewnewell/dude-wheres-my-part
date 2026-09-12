// Formatting and severity for "how long has this part been sitting here" — deliberately a
// flat, global threshold, not one derived per-operation from a routing or plan. There's no
// "expected time for this operation" anywhere in this app: the user's own routing data is
// known to run historically unreliable, so DWMP never computes a plan-vs-actual variance or
// an automated "late" judgment. These thresholds just mean "long enough that a person should
// probably glance at it" — nothing more.
const DAY = 86400

export type DwellSeverity = 'normal' | 'watch' | 'stuck'

export function dwellSeverity(seconds: number): DwellSeverity {
  if (seconds >= 4 * DAY) return 'stuck'
  if (seconds >= 2 * DAY) return 'watch'
  return 'normal'
}

export function formatDwell(seconds: number): string {
  if (seconds < 3600) return '<1 hr'
  if (seconds < DAY) return `${Math.round(seconds / 3600)} hr`
  const days = seconds / DAY
  return `${days.toFixed(days < 10 ? 1 : 0)} day${days >= 1.05 ? 's' : ''}`
}

export function formatRelative(iso: string): string {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const sec = Math.max(0, (now - then) / 1000)
  if (sec < 60) return 'just now'
  if (sec < 3600) return `${Math.round(sec / 60)} min ago`
  if (sec < DAY) return `${Math.round(sec / 3600)} hr ago`
  return `${Math.round(sec / DAY)} day${sec / DAY >= 1.05 ? 's' : ''} ago`
}
