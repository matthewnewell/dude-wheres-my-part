import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useImportBatches, useParts, useProjects } from '../api/hooks'
import { dwellSeverity, formatDwell, formatRelative } from '../lib/dwell'
import './PartsBoardPage.css'

/** The main "where's my part" view — every part, its current operation (as of the last S4
 * pull), how long it's been there, and whether anyone's flagged it hot. This is the page that
 * replaces "email someone and wait for a report." */
export default function PartsBoardPage() {
  const navigate = useNavigate()
  const [project, setProject] = useState('')
  const { data: projects } = useProjects()
  const { data: parts, isLoading } = useParts(project || undefined)
  const { data: batches } = useImportBatches()
  const latestBatch = batches?.[0]

  // `?operation=` lets the Constraints page deep-link straight to "show me the parts sitting
  // at this operation" — same plain-URL-reference pattern as the leaderboard's `?project=`.
  const [searchParams, setSearchParams] = useSearchParams()
  const operation = searchParams.get('operation')

  function clearOperation() {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('operation')
      return next
    }, { replace: true })
  }

  const sorted = useMemo(() => {
    if (!parts) return []
    const filtered = operation ? parts.filter((p) => p.status?.operation === operation) : parts
    // Longest-stuck first — the point of this board is "what needs a look," not alphabetical.
    return [...filtered].sort((a, b) => (b.status?.dwell_sec ?? 0) - (a.status?.dwell_sec ?? 0))
  }, [parts, operation])

  return (
    <div className="parts-board">
      <div className="parts-board__inner">
        <header className="parts-board__header">
          <div>
            <h1 className="parts-board__title">Parts</h1>
            <p className="parts-board__asof">
              {latestBatch
                ? <>As of the {latestBatch.source_label ?? 'last'} pull, {formatRelative(latestBatch.imported_at)}.</>
                : 'No extract imported yet.'}
            </p>
            {operation && (
              <p className="parts-board__asof">
                Filtered to operation <strong>{operation}</strong> ·{' '}
                <button className="parts-board__clear-filter" onClick={clearOperation}>clear</button>
              </p>
            )}
          </div>
          <select
            className="parts-board__project-filter"
            value={project}
            onChange={(e) => setProject(e.target.value)}
          >
            <option value="">All projects</option>
            {(projects ?? []).map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </header>

        {isLoading && <p className="parts-board__empty">Loading…</p>}
        {!isLoading && sorted.length === 0 && (
          <p className="parts-board__empty">
            No parts yet. <Link to="/import">Import an extract</Link> to get started.
          </p>
        )}

        {sorted.length > 0 && (
          <table className="parts-table">
            <thead>
              <tr>
                <th>Part</th>
                <th>Project</th>
                <th>Current operation</th>
                <th className="parts-table__num">Dwell</th>
                <th>Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => {
                const sev = p.status ? dwellSeverity(p.status.dwell_sec) : 'normal'
                return (
                  <tr
                    key={p.id}
                    className={`parts-table__row parts-table__row--${sev}`}
                    onClick={() => navigate(`/parts/${p.id}`)}
                  >
                    <td className="parts-table__strong">
                      {p.part_number}
                      {p.description && <span className="parts-table__desc"> · {p.description}</span>}
                      {p.assembly_name && (
                        <Link
                          className="parts-table__assembly-link"
                          to={`/assemblies/${p.assembly_id}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {p.assembly_name}
                        </Link>
                      )}
                    </td>
                    <td>{p.project ?? <span className="parts-table__muted">—</span>}</td>
                    <td>{p.status?.operation ?? <span className="parts-table__muted">no status yet</span>}</td>
                    <td className="parts-table__num">
                      <span className={`dwell-pill dwell-pill--${sev}`}>
                        {p.status ? formatDwell(p.status.dwell_sec) : '—'}
                      </span>
                    </td>
                    <td className="parts-table__notes">{p.status?.s4_notes ?? ''}</td>
                    <td className="parts-table__flag">
                      {!!p.open_hot_flags && (
                        <span className="hot-badge" title="Has an open expedite request">🔥 {p.open_hot_flags}</span>
                      )}
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
