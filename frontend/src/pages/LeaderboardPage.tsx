import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAssemblies, usePortfolios, useProjects } from '../api/hooks'
import { dwellSeverity, formatDwell } from '../lib/dwell'
import { daysUntil, formatDueDate, isOverdue } from '../lib/date'
import { toggleFollow, useFollowedIds } from '../lib/follow'
import type { Assembly } from '../api/types'
import './LeaderboardPage.css'

type SortKey = 'name' | 'due' | 'lateness' | 'pct' | 'wait'

function lateness(a: Assembly): number {
  const days = daysUntil(a.due_date)
  return days == null ? 0 : Math.max(0, -days)
}

function sortValue(a: Assembly, key: SortKey): number | string {
  switch (key) {
    case 'name': return a.name.toLowerCase()
    case 'due': return a.due_date ?? '9999-99-99'
    case 'lateness': return lateness(a)
    case 'pct': return a.completion.pct_complete ?? -1
    case 'wait': return a.worst_dwell_sec
  }
}

/** Default "what needs a look" order when no column header has been clicked: open flags first,
 * then overdue, then least complete, then longest wait. Clicking a header switches to a plain
 * single-column sort instead. */
function defaultCompare(a: Assembly, b: Assembly): number {
  if (a.open_hot_flags !== b.open_hot_flags) return b.open_hot_flags - a.open_hot_flags
  const aOverdue = isOverdue(a.due_date), bOverdue = isOverdue(b.due_date)
  if (aOverdue !== bOverdue) return aOverdue ? -1 : 1
  const aPct = a.completion.pct_complete ?? 101, bPct = b.completion.pct_complete ?? 101
  if (aPct !== bPct) return aPct - bPct
  return b.worst_dwell_sec - a.worst_dwell_sec
}

export default function LeaderboardPage() {
  const navigate = useNavigate()
  const { data: allPortfolios } = usePortfolios()
  const { data: projects } = useProjects()
  const { data: assemblies, isLoading } = useAssemblies()
  const followed = useFollowedIds()

  const [hiddenPortfolios, setHiddenPortfolios] = useState<Set<string>>(new Set())
  const [project, setProject] = useState('')
  const [followingOnly, setFollowingOnly] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDesc, setSortDesc] = useState(true)

  // Newly-seen portfolios default to visible (checkbox filters start all-checked).
  useEffect(() => {
    if (!allPortfolios) return
    setHiddenPortfolios((prev) => {
      const next = new Set(prev)
      for (const p of prev) if (!allPortfolios.includes(p)) next.delete(p)
      return next
    })
  }, [allPortfolios])

  function togglePortfolio(p: string) {
    setHiddenPortfolios((prev) => {
      const next = new Set(prev)
      if (next.has(p)) next.delete(p)
      else next.add(p)
      return next
    })
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDesc((d) => !d)
    else { setSortKey(key); setSortDesc(key !== 'name') }
  }

  const sorted = useMemo(() => {
    if (!assemblies) return []
    let list = assemblies.filter((a) => !(a.portfolio && hiddenPortfolios.has(a.portfolio)))
    if (project) list = list.filter((a) => a.project === project)
    if (followingOnly) list = list.filter((a) => followed.has(a.id))
    list = [...list]
    if (sortKey === null) {
      list.sort(defaultCompare)
    } else {
      list.sort((a, b) => {
        const av = sortValue(a, sortKey), bv = sortValue(b, sortKey)
        const cmp = av < bv ? -1 : av > bv ? 1 : 0
        return sortDesc ? -cmp : cmp
      })
    }
    return list
  }, [assemblies, hiddenPortfolios, project, followingOnly, followed, sortKey, sortDesc])

  function sortIndicator(key: SortKey) {
    if (sortKey !== key) return ''
    return sortDesc ? ' ▾' : ' ▴'
  }

  return (
    <div className="leaderboard">
      <div className="leaderboard__inner">
        <header className="leaderboard__header">
          <div>
            <h1 className="leaderboard__title">Leaderboard</h1>
            <p className="leaderboard__hint">Every top-level assembly. Click a column to sort.</p>
          </div>
        </header>

        <div className="leaderboard__filters">
          <div className="checkbox-filter">
            <span className="checkbox-filter__label">Portfolio</span>
            {(allPortfolios ?? []).map((p) => (
              <label key={p} className="checkbox-filter__option">
                <input
                  type="checkbox"
                  checked={!hiddenPortfolios.has(p)}
                  onChange={() => togglePortfolio(p)}
                />
                {p}
              </label>
            ))}
          </div>
          <div className="leaderboard__filters-right">
            <select value={project} onChange={(e) => setProject(e.target.value)}>
              <option value="">All projects</option>
              {(projects ?? []).map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <label className="leaderboard__following-toggle">
              <input type="checkbox" checked={followingOnly} onChange={(e) => setFollowingOnly(e.target.checked)} />
              Following only
            </label>
          </div>
        </div>

        {isLoading && <p className="leaderboard__empty">Loading…</p>}
        {!isLoading && sorted.length === 0 && <p className="leaderboard__empty">No work in progress matches these filters.</p>}

        {sorted.length > 0 && (
          <table className="leaderboard-table">
            <thead>
              <tr>
                <th></th>
                <th className="leaderboard-table__sortable" onClick={() => toggleSort('name')}>
                  Assembly{sortIndicator('name')}
                </th>
                <th>Project / Portfolio</th>
                <th className="leaderboard-table__sortable leaderboard-table__num" onClick={() => toggleSort('pct')}>
                  Complete{sortIndicator('pct')}
                </th>
                <th className="leaderboard-table__sortable" onClick={() => toggleSort('due')}>
                  Due{sortIndicator('due')}
                </th>
                <th className="leaderboard-table__sortable leaderboard-table__num" onClick={() => toggleSort('lateness')}>
                  Late{sortIndicator('lateness')}
                </th>
                <th className="leaderboard-table__sortable leaderboard-table__num" onClick={() => toggleSort('wait')}>
                  Worst wait{sortIndicator('wait')}
                </th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((a) => {
                const pct = a.completion.pct_complete
                const sev = dwellSeverity(a.worst_dwell_sec)
                const overdue = isOverdue(a.due_date)
                const late = lateness(a)
                return (
                  <tr key={a.id} className="leaderboard-table__row" onClick={() => navigate(`/assemblies/${a.id}`)}>
                    <td className="leaderboard-table__star">
                      <button
                        className={`star-btn${followed.has(a.id) ? ' star-btn--active' : ''}`}
                        onClick={(e) => { e.stopPropagation(); toggleFollow(a.id) }}
                        title={followed.has(a.id) ? 'Unfollow' : 'Follow'}
                      >
                        {followed.has(a.id) ? '★' : '☆'}
                      </button>
                    </td>
                    <td className="leaderboard-table__strong">
                      {a.name}
                      {!!a.open_hot_flags && <span className="hot-badge"> 🔥 {a.open_hot_flags}</span>}
                    </td>
                    <td className="leaderboard-table__meta">
                      {a.project}
                      {a.portfolio && <span className="leaderboard-table__portfolio"> · {a.portfolio}</span>}
                    </td>
                    <td className="leaderboard-table__num">
                      <div className="mini-progress">
                        <div className="mini-progress__track">
                          <div className="mini-progress__fill" style={{ width: `${pct ?? 0}%` }} />
                        </div>
                        <span>{pct != null ? `${pct}%` : '—'}</span>
                      </div>
                    </td>
                    <td>{formatDueDate(a.due_date)}</td>
                    <td className="leaderboard-table__num">
                      {overdue ? <span className="late-pill">{late}d</span> : <span className="leaderboard-table__muted">—</span>}
                    </td>
                    <td className="leaderboard-table__num">
                      <span className={`dwell-pill dwell-pill--${sev}`}>{formatDwell(a.worst_dwell_sec)}</span>
                    </td>
                    <td></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
