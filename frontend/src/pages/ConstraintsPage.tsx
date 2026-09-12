import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useConstraints, useProjects } from '../api/hooks'
import { dwellSeverity, formatDwell } from '../lib/dwell'
import './ConstraintsPage.css'

/** "Where is work piling up right now" — every currently-tracked part's operation, grouped and
 * counted, worst first. This is the Theory-of-Constraints view: not per-assembly (Leaderboard)
 * or per-part (Parts board), but per-operation. Same rule as the rest of the app: a count and a
 * raw wall-clock dwell time, never a queue-vs-capacity or expected-time judgment — a bottleneck
 * is something a person recognizes here, not something this page declares. */
export default function ConstraintsPage() {
  const navigate = useNavigate()
  const [project, setProject] = useState('')
  const { data: projects } = useProjects()
  const { data: rows, isLoading } = useConstraints(project || undefined)

  const totalParts = useMemo(() => (rows ?? []).reduce((sum, r) => sum + r.part_count, 0), [rows])

  return (
    <div className="constraints">
      <div className="constraints__inner">
        <header className="constraints__header">
          <div>
            <h1 className="constraints__title">Constraints</h1>
            <p className="constraints__hint">
              Every operation currently holding parts, most-parts first — where work is piling up right now.
            </p>
          </div>
          <select value={project} onChange={(e) => setProject(e.target.value)}>
            <option value="">All projects</option>
            {(projects ?? []).map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </header>

        {isLoading && <p className="constraints__empty">Loading…</p>}
        {!isLoading && (rows ?? []).length === 0 && (
          <p className="constraints__empty">No parts with a known status yet — import an extract to get started.</p>
        )}

        {!!rows?.length && (
          <table className="constraints-table">
            <thead>
              <tr>
                <th>Operation</th>
                <th className="constraints-table__num">Parts waiting</th>
                <th className="constraints-table__num">Oldest wait</th>
                <th className="constraints-table__num">Open flags</th>
                <th className="constraints-table__num">Share</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const sev = dwellSeverity(r.oldest_dwell_sec)
                const share = totalParts > 0 ? Math.round((100 * r.part_count) / totalParts) : 0
                return (
                  <tr
                    key={r.operation}
                    className="constraints-table__row"
                    onClick={() => navigate(`/parts?operation=${encodeURIComponent(r.operation)}`)}
                  >
                    <td className="constraints-table__strong">
                      {r.operation}
                      {!!r.open_hot_flags && <span className="hot-badge"> 🔥 {r.open_hot_flags}</span>}
                    </td>
                    <td className="constraints-table__num">{r.part_count}</td>
                    <td className="constraints-table__num">
                      <span className={`dwell-pill dwell-pill--${sev}`}>{formatDwell(r.oldest_dwell_sec)}</span>
                    </td>
                    <td className="constraints-table__num">
                      {r.open_hot_flags || <span className="constraints-table__muted">—</span>}
                    </td>
                    <td className="constraints-table__num">
                      <div className="mini-bar">
                        <div className="mini-bar__track">
                          <div className="mini-bar__fill" style={{ width: `${share}%` }} />
                        </div>
                        <span className="constraints-table__muted">{share}%</span>
                      </div>
                    </td>
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
