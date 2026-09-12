import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAssembly, useAssemblyFlatten } from '../api/hooks'
import type { FlatPart } from '../api/types'
import { dwellSeverity, formatDwell } from '../lib/dwell'
import { daysUntil, formatDueDate, isOverdue } from '../lib/date'
import { toggleFollow, useFollowedIds } from '../lib/follow'
import './PartsBoardPage.css'
import './AssemblyDetailPage.css'

export default function AssemblyDetailPage() {
  const { assemblyId } = useParams<{ assemblyId: string }>()
  const navigate = useNavigate()
  const { data: assembly, isLoading } = useAssembly(assemblyId)
  const followed = useFollowedIds()

  // Always fetched (not just when the table's own Flatten toggle is on) — the "Waiting on"
  // stat needs to know every part in the subtree regardless of which table view is showing.
  const { data: flatParts, isLoading: flattenLoading } = useAssemblyFlatten(assemblyId)
  const hasChildren = !!assembly?.children?.length
  const [flatten, setFlatten] = useState(false)

  const sortedParts = useMemo(() => {
    if (!assembly?.parts) return []
    return [...assembly.parts].sort((a, b) => (b.status?.dwell_sec ?? 0) - (a.status?.dwell_sec ?? 0))
  }, [assembly])

  const outstanding = useMemo(() => (flatParts ?? []).filter((p) => p.done !== true), [flatParts])

  if (isLoading || !assembly) return <div className="assembly-detail__loading">Loading…</div>

  const pct = assembly.completion.pct_complete
  const overdue = isOverdue(assembly.due_date)
  const days = daysUntil(assembly.due_date)

  return (
    <div className="assembly-detail">
      <div className="assembly-detail__inner">
        <header className="assembly-detail__header">
          <div>
            <div className="assembly-detail__title-row">
              <h1 className="assembly-detail__title">{assembly.name}</h1>
              <button
                className={`star-btn star-btn--lg${followed.has(assembly.id) ? ' star-btn--active' : ''}`}
                onClick={() => toggleFollow(assembly.id)}
                title={followed.has(assembly.id) ? 'Unfollow' : 'Follow'}
              >
                {followed.has(assembly.id) ? '★ Following' : '☆ Follow'}
              </button>
            </div>
            <nav className="assembly-detail__breadcrumb">
              {assembly.project ? (
                <Link to={`/?project=${encodeURIComponent(assembly.project)}`}>{assembly.project}</Link>
              ) : (
                <Link to="/">Assembly</Link>
              )}
              {(assembly.ancestors ?? []).map((a) => (
                <span key={a.id}>
                  {' / '}
                  <Link to={`/assemblies/${a.id}`}>{a.name}</Link>
                </span>
              ))}
              <span> / {assembly.name}</span>
            </nav>
            <div className="assembly-detail__badges">
              {assembly.project && <span className="assembly-detail__badge">{assembly.project}</span>}
              {assembly.portfolio && (
                <span className="assembly-detail__badge assembly-detail__badge--portfolio">{assembly.portfolio}</span>
              )}
            </div>
          </div>
          <div className="assembly-detail__stats">
            <div>
              <div className="assembly-detail__stat-label">Complete</div>
              <div className="assembly-detail__stat-value">
                {pct != null ? `${pct}%` : '—'}
                {assembly.completion.complete_parts != null && (
                  <span className="assembly-detail__stat-sub"> ({assembly.completion.complete_parts}/{assembly.completion.total_parts})</span>
                )}
              </div>
            </div>
            <div>
              <div className="assembly-detail__stat-label">Waiting on</div>
              <div className="assembly-detail__stat-value">
                {flattenLoading ? '—' : outstanding.length}
                {!flattenLoading && (
                  <span className="assembly-detail__stat-sub"> of {(flatParts ?? []).length}</span>
                )}
              </div>
            </div>
            <div>
              <div className="assembly-detail__stat-label">Due</div>
              <div className={`assembly-detail__stat-value${overdue ? ' assembly-detail__stat-value--overdue' : ''}`}>
                {assembly.due_date ? (overdue ? `Overdue (${formatDueDate(assembly.due_date)})` : `${formatDueDate(assembly.due_date)} (${days}d)`) : '—'}
              </div>
            </div>
          </div>
        </header>

        {!assembly.terminal_operation && (
          <p className="assembly-detail__note">
            No terminal operation set for this assembly, so %complete is unknown rather than guessed — "Waiting on" below
            still shows every part that hasn't been confirmed done.
            {hasChildren && ' Rolled up across every subassembly below.'}
          </p>
        )}

        <section className="assembly-detail__section">
          <div className="assembly-detail__section-heading">
            <h2 className="assembly-detail__section-title">
              {flatten ? 'All components' : 'Direct parts'}
            </h2>
            {hasChildren && (
              <button className="dwmp-btn dwmp-btn--ghost" onClick={() => setFlatten((v) => !v)}>
                {flatten ? 'Show direct parts only' : '⊞ Flatten: show every component'}
              </button>
            )}
          </div>

          <table className="parts-table">
            <thead>
              <tr>
                <th>Part</th>
                {flatten && <th>Subassembly</th>}
                <th>Current operation</th>
                <th className="parts-table__num">Dwell</th>
                <th>Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(flatten ? flatParts ?? [] : sortedParts).map((p) => {
                const sev = p.status ? dwellSeverity(p.status.dwell_sec) : 'normal'
                const path = flatten ? (p as FlatPart).assembly_path : undefined
                return (
                  <tr
                    key={p.id}
                    className={`parts-table__row parts-table__row--${sev}`}
                    onClick={() => navigate(`/parts/${p.id}`)}
                  >
                    <td className="parts-table__strong">
                      {p.part_number}
                      {p.description && <span className="parts-table__desc"> · {p.description}</span>}
                    </td>
                    {flatten && (
                      <td className="parts-table__meta">
                        {path && path.length > 1 ? path.slice(1).join(' › ') : <span className="parts-table__muted">direct</span>}
                      </td>
                    )}
                    <td>
                      {p.status?.operation ?? <span className="parts-table__muted">no status yet</span>}
                      {p.done === true && <span className="assembly-detail__done-tag"> ✓ done</span>}
                    </td>
                    <td className="parts-table__num">
                      <span className={`dwell-pill dwell-pill--${sev}`}>
                        {p.status ? formatDwell(p.status.dwell_sec) : '—'}
                      </span>
                    </td>
                    <td className="parts-table__notes">{p.status?.s4_notes ?? ''}</td>
                    <td className="parts-table__flag">
                      {!!p.open_hot_flags && <span className="hot-badge">🔥 {p.open_hot_flags}</span>}
                    </td>
                  </tr>
                )
              })}
              {flatten && flattenLoading && (
                <tr><td colSpan={6} className="parts-table__muted">Loading…</td></tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="assembly-detail__section">
          <div className="assembly-detail__section-heading">
            <h2 className="assembly-detail__section-title">Subassemblies</h2>
          </div>

          {hasChildren ? (
            <div className="assembly-detail__children">
              {assembly.children!.map((child) => {
                const childPct = child.completion.pct_complete
                const sev = dwellSeverity(child.worst_dwell_sec)
                return (
                  <button
                    key={child.id}
                    className="child-card"
                    onClick={() => navigate(`/assemblies/${child.id}`)}
                  >
                    <div className="child-card__top">
                      <span className="child-card__name">{child.name}</span>
                      {!!child.open_hot_flags && <span className="hot-badge">🔥 {child.open_hot_flags}</span>}
                    </div>
                    <div className="mini-progress">
                      <div className="mini-progress__track">
                        <div className="mini-progress__fill" style={{ width: `${childPct ?? 0}%` }} />
                      </div>
                      <span>{childPct != null ? `${childPct}%` : '—'}</span>
                    </div>
                    <div className="child-card__meta">
                      {child.part_count} direct part{child.part_count === 1 ? '' : 's'}
                      {!!child.child_count && ` · ${child.child_count} sub`}
                      {' · '}
                      <span className={`dwell-pill dwell-pill--${sev}`}>{formatDwell(child.worst_dwell_sec)}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          ) : (
            <p className="assembly-detail__empty">No subassemblies — every part above is direct.</p>
          )}
        </section>
      </div>
    </div>
  )
}
