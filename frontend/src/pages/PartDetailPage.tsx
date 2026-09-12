import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useCreateHotFlag, usePart, useUpdateHotFlag } from '../api/hooks'
import { dwellSeverity, formatDwell, formatRelative } from '../lib/dwell'
import type { HotFlag } from '../api/types'
import './PartDetailPage.css'

export default function PartDetailPage() {
  const { partId } = useParams<{ partId: string }>()
  const { data: part, isLoading } = usePart(partId)
  const createFlag = useCreateHotFlag(partId ?? '')
  const [requestedBy, setRequestedBy] = useState('')
  const [reason, setReason] = useState('')
  const [composing, setComposing] = useState(false)

  if (isLoading || !part) return <div className="part-detail__loading">Loading…</div>

  const sev = part.status ? dwellSeverity(part.status.dwell_sec) : 'normal'
  const openFlags = (part.hot_flags ?? []).filter((f) => f.status !== 'resolved')
  const resolvedFlags = (part.hot_flags ?? []).filter((f) => f.status === 'resolved')
  const history = [...(part.snapshots ?? [])].reverse()

  function handleFlag() {
    if (!requestedBy.trim() || !reason.trim()) return
    createFlag.mutate(
      { requested_by: requestedBy.trim(), reason: reason.trim() },
      { onSuccess: () => { setRequestedBy(''); setReason(''); setComposing(false) } },
    )
  }

  return (
    <div className="part-detail">
      <div className="part-detail__inner">
        <Link className="part-detail__back" to="/">← Parts</Link>

        <header className="part-detail__header">
          <div>
            <h1 className="part-detail__title">{part.part_number}</h1>
            <p className="part-detail__meta">
              {part.description ?? 'No description'}
              {part.project && <> · {part.project}</>}
              {part.order_number && <> · {part.order_number}</>}
            </p>
          </div>
          {!composing ? (
            <button className="dwmp-btn dwmp-btn--primary" onClick={() => setComposing(true)}>
              🔥 Flag for expedite
            </button>
          ) : (
            <div className="flag-form">
              <input
                placeholder="Your name"
                value={requestedBy}
                onChange={(e) => setRequestedBy(e.target.value)}
              />
              <textarea
                rows={2}
                placeholder="Why does this need to jump the queue?"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <div className="flag-form__actions">
                <button className="dwmp-btn dwmp-btn--primary" onClick={handleFlag} disabled={createFlag.isPending}>
                  {createFlag.isPending ? 'Flagging…' : 'Submit'}
                </button>
                <button className="dwmp-btn dwmp-btn--ghost" onClick={() => setComposing(false)}>Cancel</button>
              </div>
            </div>
          )}
        </header>

        <section className="part-detail__status-card">
          {part.status ? (
            <>
              <div className="part-detail__status-row">
                <div>
                  <div className="part-detail__status-label">Current operation</div>
                  <div className="part-detail__status-value">{part.status.operation}</div>
                </div>
                <div>
                  <div className="part-detail__status-label">Dwell time</div>
                  <div className={`part-detail__dwell part-detail__dwell--${sev}`}>
                    {formatDwell(part.status.dwell_sec)}
                  </div>
                </div>
              </div>
              {part.status.s4_notes && (
                <p className="part-detail__notes">"{part.status.s4_notes}"</p>
              )}
              <p className="part-detail__asof">
                As of the extract pulled {formatRelative(part.status.last_imported_at)}
                {part.status.s4_date && <> · S4 date on that row: {part.status.s4_date}</>}
              </p>
            </>
          ) : (
            <p className="part-detail__asof">No status yet — this part hasn't appeared in an import.</p>
          )}
        </section>

        {openFlags.length > 0 && (
          <section className="part-detail__section">
            <h2 className="part-detail__section-title">Open expedite requests</h2>
            {openFlags.map((f) => (
              <HotFlagRow key={f.id} flag={f} />
            ))}
          </section>
        )}

        <section className="part-detail__section">
          <h2 className="part-detail__section-title">History</h2>
          {history.length === 0 ? (
            <p className="part-detail__empty">No snapshots yet.</p>
          ) : (
            <ul className="history-list">
              {history.map((s) => (
                <li key={s.id} className="history-item">
                  <span className="history-item__op">{s.operation}</span>
                  <span className="history-item__when">{formatRelative(s.imported_at)}</span>
                  {s.s4_notes && <span className="history-item__notes">"{s.s4_notes}"</span>}
                </li>
              ))}
            </ul>
          )}
        </section>

        {resolvedFlags.length > 0 && (
          <section className="part-detail__section">
            <h2 className="part-detail__section-title">Resolved requests</h2>
            {resolvedFlags.map((f) => (
              <HotFlagRow key={f.id} flag={f} />
            ))}
          </section>
        )}
      </div>
    </div>
  )
}

function HotFlagRow({ flag }: { flag: HotFlag }) {
  const update = useUpdateHotFlag()
  const [ackName, setAckName] = useState('')
  const [acking, setActing] = useState(false)

  return (
    <div className={`flag-row flag-row--${flag.status}`}>
      <div className="flag-row__main">
        <span className="flag-row__status">{flag.status}</span>
        <span className="flag-row__reason">{flag.reason}</span>
        <span className="flag-row__meta">
          — {flag.requested_by}, {formatRelative(flag.requested_at)}
          {flag.acknowledged_by && <> · ack'd by {flag.acknowledged_by}</>}
        </span>
      </div>
      {flag.status === 'open' && !acking && (
        <button className="dwmp-btn dwmp-btn--ghost" onClick={() => setActing(true)}>Acknowledge</button>
      )}
      {flag.status === 'open' && acking && (
        <div className="flag-row__ack">
          <input placeholder="Your name" value={ackName} onChange={(e) => setAckName(e.target.value)} />
          <button
            className="dwmp-btn dwmp-btn--primary"
            disabled={!ackName.trim() || update.isPending}
            onClick={() => update.mutate({ flagId: flag.id, status: 'acknowledged', acknowledgedBy: ackName.trim() })}
          >
            Confirm
          </button>
        </div>
      )}
      {flag.status === 'acknowledged' && (
        <button
          className="dwmp-btn dwmp-btn--ghost"
          disabled={update.isPending}
          onClick={() => update.mutate({ flagId: flag.id, status: 'resolved' })}
        >
          Mark resolved
        </button>
      )}
    </div>
  )
}
