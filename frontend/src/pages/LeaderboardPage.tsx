import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAssemblies, usePortfolios, useProjects } from '../api/hooks'
import { dwellSeverity, formatDwell } from '../lib/dwell'
import { daysUntil, formatDueDate, isOverdue } from '../lib/date'
import type { Assembly } from '../api/types'
import './LeaderboardPage.css'

/** The org-wide view: one row per top-level assembly, worst-first. A project follows its own
 * assemblies via the project filter; leaving both filters open is the portfolio-owner view —
 * comparing across projects, which is who actually has standing to reprioritize between them. */
export default function LeaderboardPage() {
  const navigate = useNavigate()
  const [portfolio, setPortfolio] = useState('')
  const [project, setProject] = useState('')
  const { data: portfolios } = usePortfolios()
  const { data: projects } = useProjects()
  const { data: assemblies, isLoading } = useAssemblies({ portfolio: portfolio || undefined, project: project || undefined })

  const sorted = useMemo(() => {
    if (!assemblies) return []
    return [...assemblies].sort((a, b) => {
      if (a.open_hot_flags !== b.open_hot_flags) return b.open_hot_flags - a.open_hot_flags
      const aOverdue = isOverdue(a.due_date), bOverdue = isOverdue(b.due_date)
      if (aOverdue !== bOverdue) return aOverdue ? -1 : 1
      const aPct = a.completion.pct_complete ?? 101
      const bPct = b.completion.pct_complete ?? 101
      if (aPct !== bPct) return aPct - bPct
      return b.worst_dwell_sec - a.worst_dwell_sec
    })
  }, [assemblies])

  return (
    <div className="leaderboard">
      <div className="leaderboard__inner">
        <header className="leaderboard__header">
          <div>
            <h1 className="leaderboard__title">Leaderboard</h1>
            <p className="leaderboard__hint">Every top-level assembly, worst-first.</p>
          </div>
          <div className="leaderboard__filters">
            <select value={portfolio} onChange={(e) => setPortfolio(e.target.value)}>
              <option value="">All portfolios</option>
              {(portfolios ?? []).map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <select value={project} onChange={(e) => setProject(e.target.value)}>
              <option value="">All projects</option>
              {(projects ?? []).map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </header>

        {isLoading && <p className="leaderboard__empty">Loading…</p>}
        {!isLoading && sorted.length === 0 && <p className="leaderboard__empty">No assemblies yet.</p>}

        <div className="assembly-cards">
          {sorted.map((a) => (
            <AssemblyCard key={a.id} assembly={a} onOpen={() => navigate(`/assemblies/${a.id}`)} />
          ))}
        </div>
      </div>
    </div>
  )
}

function AssemblyCard({ assembly, onOpen }: { assembly: Assembly; onOpen: () => void }) {
  const pct = assembly.completion.pct_complete
  const sev = dwellSeverity(assembly.worst_dwell_sec)
  const overdue = isOverdue(assembly.due_date)
  const days = daysUntil(assembly.due_date)

  return (
    <button className="assembly-card" onClick={onOpen}>
      <div className="assembly-card__top">
        <div>
          <div className="assembly-card__name">{assembly.name}</div>
          <div className="assembly-card__meta">
            {assembly.project} {assembly.portfolio && <>· {assembly.portfolio}</>}
          </div>
        </div>
        {!!assembly.open_hot_flags && (
          <span className="hot-badge" title="Has an open expedite request">🔥 {assembly.open_hot_flags}</span>
        )}
      </div>

      <div className="assembly-card__progress-row">
        <div className="assembly-card__progress-track">
          <div
            className="assembly-card__progress-fill"
            style={{ width: `${pct ?? 0}%` }}
          />
        </div>
        <span className="assembly-card__pct">
          {pct != null ? `${pct}%` : '—'}
          {assembly.completion.complete_parts != null && (
            <span className="assembly-card__pct-sub"> ({assembly.completion.complete_parts}/{assembly.completion.total_parts})</span>
          )}
        </span>
      </div>

      <div className="assembly-card__bottom">
        <span className={`due-pill${overdue ? ' due-pill--overdue' : ''}`}>
          {assembly.due_date
            ? overdue ? `Overdue since ${formatDueDate(assembly.due_date)}` : `Due ${formatDueDate(assembly.due_date)} (${days}d)`
            : 'No due date'}
        </span>
        <span className={`dwell-pill dwell-pill--${sev}`}>
          Worst wait: {formatDwell(assembly.worst_dwell_sec)}
        </span>
      </div>
    </button>
  )
}
