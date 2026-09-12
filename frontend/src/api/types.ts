export interface StatusSnapshot {
  id: string
  part_id: string
  import_batch_id: string
  operation: string
  s4_notes: string | null
  s4_date: string | null
  imported_at: string
}

/** Computed from a part's snapshot history — never stored. No "expected time" or "on
 * schedule" judgment anywhere here: routing/plan data is known to run unreliable, so this is
 * deliberately just "how long, wall-clock, has it actually been sitting here." */
export interface PartStatus {
  operation: string
  s4_notes: string | null
  s4_date: string | null
  since: string
  dwell_sec: number
  last_imported_at: string
  snapshot_count: number
}

export type HotFlagStatus = 'open' | 'acknowledged' | 'resolved'

export interface HotFlag {
  id: string
  part_id: string
  requested_by: string
  reason: string
  requested_at: string
  status: HotFlagStatus
  acknowledged_by: string | null
  acknowledged_at: string | null
  resolved_at: string | null
}

export interface Part {
  id: string
  part_number: string
  description: string | null
  project: string | null
  order_number: string | null
  created_at: string
  status: PartStatus | null
  open_hot_flags?: number
  snapshots?: StatusSnapshot[]
  hot_flags?: HotFlag[]
}

export interface ImportBatch {
  id: string
  imported_at: string
  source_label: string | null
  row_count: number
}

export interface ImportRow {
  part_number: string
  operation: string
  notes?: string
  date?: string
  project?: string
  order_number?: string
  description?: string
}
