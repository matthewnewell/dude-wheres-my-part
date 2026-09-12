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
  /** The part's own project label, or — once it's assigned to an assembly — that assembly's
   * project. See assembly_id/assembly_name for which case you're in. */
  project: string | null
  order_number: string | null
  assembly_id: string | null
  assembly_name: string | null
  created_at: string
  status: PartStatus | null
  open_hot_flags?: number
  /** Root-to-direct-assembly chain of names — "Bracket Assembly Unit 1", "Fastener Kit",
   * "Hardware Set" — not just assembly_name's leaf. [] (or absent) if unassigned. Present on
   * /parts and /parts/:id; not sent everywhere a Part appears. */
  assembly_chain?: string[]
  snapshots?: StatusSnapshot[]
  hot_flags?: HotFlag[]
}

/** %complete is a count of fact (parts at the assembly's declared terminal operation), never a
 * plan comparison — see backend/models.py. Both counts are null when there's no
 * terminal_operation set (or no parts yet): honestly unknown, not guessed. */
export interface AssemblyCompletion {
  total_parts: number
  complete_parts: number | null
  pct_complete: number | null
}

export interface Assembly {
  id: string
  name: string
  project: string | null
  portfolio: string | null
  due_date: string | null
  terminal_operation: string | null
  /** Null for a top-level assembly — the only kind the leaderboard lists. Set for a
   * subassembly, which surfaces only by drilling into its parent. */
  parent_assembly_id: string | null
  created_at: string
  /** Direct parts/children only — see `completion`/`worst_dwell_sec` for the whole-subtree
   * rollup, and GET /assemblies/:id/flatten for every part at any depth in one list. */
  part_count: number
  child_count: number
  completion: AssemblyCompletion
  worst_dwell_sec: number
  open_hot_flags: number
  /** Detail endpoint only. */
  parts?: Part[]
  children?: Assembly[]
  /** Root-to-self breadcrumb, not including this assembly itself. */
  ancestors?: Assembly[]
}

/** One row of the flatten view — every part anywhere under an assembly, regardless of depth.
 * `assembly_path` is the subassembly chain (this assembly first) the part actually lives in. */
export interface FlatPart extends Part {
  assembly_path: string[]
}

/** One row of the Constraints view: everywhere currently-tracked parts are sitting right now,
 * grouped by operation. A count and the oldest raw dwell time in that group — never a
 * queue-vs-capacity or expected-time judgment, same rule as the rest of this app. */
export interface OperationConstraint {
  operation: string
  part_count: number
  oldest_dwell_sec: number
  open_hot_flags: number
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
