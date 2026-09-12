import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useImportBatches, useImportExtract } from '../api/hooks'
import type { ImportRow } from '../api/types'
import { formatRelative } from '../lib/dwell'
import './ImportPage.css'

const HEADER_MAP: Record<string, keyof ImportRow> = {
  'part id': 'part_number', 'part_id': 'part_number', 'part number': 'part_number',
  'part_number': 'part_number', 'part': 'part_number',
  'location': 'operation', 'operation': 'operation', 'where in manufacture': 'operation',
  'notes': 'notes', 'user notes': 'notes', 'note': 'notes',
  'date': 'date', 'dates': 'date',
  'project': 'project',
  'order': 'order_number', 'order_number': 'order_number', 'order number': 'order_number', 'wo': 'order_number',
  'description': 'description', 'desc': 'description',
}

/** Turns pasted, tab- or comma-separated text (first row = headers) into ImportRow[]. This is
 * the on-demand pull, digitized: paste what the S4 report gave you instead of emailing it
 * around. Column names are matched loosely (case-insensitive, a few synonyms) since a report
 * export's exact headers vary. */
function parseExtract(text: string): { rows: ImportRow[]; unknownColumns: string[] } {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return { rows: [], unknownColumns: [] }

  const delim = lines[0].includes('\t') ? '\t' : ','
  const headers = lines[0].split(delim).map((h) => h.trim().toLowerCase())
  const unknownColumns: string[] = []
  const fields = headers.map((h) => {
    const mapped = HEADER_MAP[h]
    if (!mapped) unknownColumns.push(h)
    return mapped
  })

  const rows: ImportRow[] = []
  for (const line of lines.slice(1)) {
    const cells = line.split(delim)
    const row: Partial<ImportRow> = {}
    fields.forEach((field, i) => {
      if (field && cells[i] !== undefined) row[field] = cells[i].trim()
    })
    if (row.part_number && row.operation) rows.push(row as ImportRow)
  }
  return { rows, unknownColumns }
}

export default function ImportPage() {
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const [sourceLabel, setSourceLabel] = useState('S4 extract')
  const importExtract = useImportExtract()
  const { data: batches } = useImportBatches()

  const { rows, unknownColumns } = useMemo(() => parseExtract(text), [text])

  function handleImport() {
    if (rows.length === 0) return
    importExtract.mutate(
      { source_label: sourceLabel.trim() || undefined, rows },
      { onSuccess: () => navigate('/') },
    )
  }

  return (
    <div className="import-page">
      <div className="import-page__inner">
        <h1 className="import-page__title">Import an extract</h1>
        <p className="import-page__hint">
          Paste the report as you get it out of S4 — part id, location, notes, date, one row per
          part, with a header row. Tab- or comma-separated both work. This is a manual, on-demand
          pull today (not a live feed) — every part in the paste is recorded as-of right now.
        </p>

        <label className="import-page__field">
          <span>Source label</span>
          <input value={sourceLabel} onChange={(e) => setSourceLabel(e.target.value)} />
        </label>

        <label className="import-page__field">
          <span>Paste extract</span>
          <textarea
            className="import-page__textarea"
            rows={10}
            placeholder={'Part ID\tLocation\tNotes\tDate\nBKT-1001\tWeld\tawaiting fixture\t2026-09-10'}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </label>

        {text.trim() && (
          <div className="import-page__preview">
            <p>
              {rows.length} row{rows.length === 1 ? '' : 's'} recognized
              {unknownColumns.length > 0 && (
                <> · ignored columns: {unknownColumns.join(', ')}</>
              )}
            </p>
            {rows.length > 0 && (
              <table className="import-preview-table">
                <thead>
                  <tr><th>Part</th><th>Operation</th><th>Notes</th><th>Date</th></tr>
                </thead>
                <tbody>
                  {rows.slice(0, 8).map((r, i) => (
                    <tr key={i}>
                      <td>{r.part_number}</td><td>{r.operation}</td>
                      <td>{r.notes ?? ''}</td><td>{r.date ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {rows.length > 8 && <p className="import-page__more">…and {rows.length - 8} more</p>}
          </div>
        )}

        <button
          className="dwmp-btn dwmp-btn--primary"
          disabled={rows.length === 0 || importExtract.isPending}
          onClick={handleImport}
        >
          {importExtract.isPending ? 'Importing…' : `Import ${rows.length || ''} row${rows.length === 1 ? '' : 's'}`}
        </button>

        {(batches?.length ?? 0) > 0 && (
          <section className="import-page__history">
            <h2 className="import-page__history-title">Past imports</h2>
            <ul>
              {batches!.map((b) => (
                <li key={b.id}>
                  {b.source_label} · {b.row_count} rows · {formatRelative(b.imported_at)}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}
