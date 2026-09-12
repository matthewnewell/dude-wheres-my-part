import { Fragment, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useConstraints, useParts, useProjects } from '../api/hooks'
import { dwellSeverity, formatDwell } from '../lib/dwell'
import type { Part } from '../api/types'
import './ConstraintsPage.css'

/** "Where is work piling up right now" — every currently-tracked part's operation, grouped and
 * counted, worst first. This is the Theory-of-Constraints view: not per-assembly (Assembly) or
 * per-part (Parts board), but per-operation. Same rule as the rest of the app: a count and a raw
 * wall-clock dwell time, never a queue-vs-capacity or expected-time judgment — a bottleneck is
 * something a person recognizes here, not something this page declares (though the worst row
 * gets a callout, so the softer name doesn't cost the signal). Expand a row to see the actual
 * parts sitting there without leaving the page; click one for its full context. */
export default function ConstraintsPage() {
  const [project, setProject] = useState('')
  const { data: projects } = useProjects()
  const { data: rows, isLoading } = useConstraints(project || undefined)
  const { data: allParts } = useParts(project || undefined)

  const [expanded, setExpanded] = useState<string | null>(null)
  const [popupPart, setPopupPart] = useState<Part | null>(null)

  const totalParts = useMemo(() => (rows ?? []).reduce((sum, r) => sum + r.part_count, 0), [rows])

  const partsByOperation = useMemo(() => {
    const map = new Map<string, Part[]>()
    for (const p of allParts ?? []) {
      if (!p.status) continue
      const list = map.get(p.status.operation) ?? []
      list.push(p)
      map.set(p.status.operation, list)
    }
    for (const list of map.values()) list.sort((a, b) => (b.status?.dwell_sec ?? 0) - (a.status?.dwell_sec ?? 0))
    return map
  }, [allParts])

  return (
    <div className="constraints">
      <div className="constraints__inner">
        <header className="constraints__header">
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
                <th></th>
                <th>Operation</th>
                <th className="constraints-table__num">Parts waiting</th>
                <th className="constraints-table__num">Oldest wait</th>
                <th className="constraints-table__num">Open flags</th>
                <th className="constraints-table__num">Share</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const sev = dwellSeverity(r.oldest_dwell_sec)
                const share = totalParts > 0 ? Math.round((100 * r.part_count) / totalParts) : 0
                const isOpen = expanded === r.operation
                const parts = partsByOperation.get(r.operation) ?? []
                return (
                  <Fragment key={r.operation}>
                    <tr
                      className={`constraints-table__row${isOpen ? ' constraints-table__row--open' : ''}`}
                      onClick={() => setExpanded(isOpen ? null : r.operation)}
                    >
                      <td className="constraints-table__chevron">{isOpen ? '▾' : '▸'}</td>
                      <td className="constraints-table__strong">
                        {i === 0 && <span className="bottleneck-badge">Bottleneck</span>}
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
                    {isOpen && (
                      <tr className="constraints-table__expansion-row">
                        <td></td>
                        <td colSpan={5}>
                          <div className="constraints-expansion">
                            <div className="constraints-expansion__chips">
                              {parts.map((p) => {
                                const psev = p.status ? dwellSeverity(p.status.dwell_sec) : 'normal'
                                return (
                                  <button
                                    key={p.id}
                                    className="part-chip"
                                    onClick={(e) => { e.stopPropagation(); setPopupPart(p) }}
                                  >
                                    <span className="part-chip__number">{p.part_number}</span>
                                    <span className={`dwell-pill dwell-pill--${psev}`}>
                                      {p.status ? formatDwell(p.status.dwell_sec) : '—'}
                                    </span>
                                    {!!p.open_hot_flags && <span className="hot-badge">🔥</span>}
                                  </button>
                                )
                              })}
                            </div>
                            <Link
                              className="constraints-expansion__link"
                              to={`/parts?operation=${encodeURIComponent(r.operation)}`}
                              onClick={(e) => e.stopPropagation()}
                            >
                              View all in Work in Progress →
                            </Link>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {popupPart && (
        <div className="part-popup-backdrop" onClick={() => setPopupPart(null)}>
          <div className="part-popup" onClick={(e) => e.stopPropagation()}>
            <button className="part-popup__close" onClick={() => setPopupPart(null)} aria-label="Close">✕</button>
            <div className="part-popup__number">{popupPart.part_number}</div>
            {popupPart.description && <p className="part-popup__desc">{popupPart.description}</p>}

            <dl className="part-popup__facts">
              <dt>Project</dt>
              <dd>{popupPart.project ?? '—'}</dd>
              <dt>Belongs to</dt>
              <dd>
                {popupPart.assembly_chain?.length ? popupPart.assembly_chain.join(' › ') : 'Not yet assigned to an assembly'}
              </dd>
              <dt>Current operation</dt>
              <dd>{popupPart.status?.operation ?? 'no status yet'}</dd>
              <dt>Dwell</dt>
              <dd>{popupPart.status ? formatDwell(popupPart.status.dwell_sec) : '—'}</dd>
              {popupPart.status?.s4_notes && (<><dt>Notes</dt><dd>{popupPart.status.s4_notes}</dd></>)}
              {!!popupPart.open_hot_flags && (<><dt>Open flags</dt><dd>🔥 {popupPart.open_hot_flags}</dd></>)}
            </dl>

            <Link className="dwmp-btn dwmp-btn--ghost" to={`/parts/${popupPart.id}`}>View full part →</Link>
          </div>
        </div>
      )}
    </div>
  )
}
