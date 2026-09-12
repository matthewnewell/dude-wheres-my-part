# Dude, Where's My Part?

A shop-floor visibility tool: where a part actually is in manufacture, how long it's actually
been there, and a shared way to say "this one needs to jump the queue" — without an email.

## The problem this is scoped to

S4 already knows where a part is (it's mostly a procurement system, but production
confirmations flow into it). The pain isn't missing data — it's that getting an answer today
means asking someone to go pull a report, and what comes back is a flat export (part id,
location, notes, dates), not something you can browse or watch move. And reprioritizing a job
happens by email or phone call, invisible to anyone not on that thread.

So this app is deliberately **not** a new system of record for part location. It's:

1. A better front end over an on-demand S4 extract (paste it in instead of it living in an
   inbox).
2. Dwell time computed from successive extracts — how long a part has actually sat at its
   current operation.
3. A shared hot-flag list — the one piece that doesn't exist in S4 at all.

**No plan-vs-actual anywhere.** The user's own routing data is known to run historically
unreliable, so this never computes an "expected time for this operation" or an automated
"this is late" judgment. It shows raw dwell time and lets a person decide. See
`backend/models.py`'s module docstring and `frontend/src/lib/dwell.ts` for where that design
constraint is enforced.

## Stack

Same as Value Stream / Conway's Depot — Flask + SQLAlchemy + SQLite backend, React + TypeScript
+ Vite frontend, tied to the rest of the ecosystem only by convention (plain-text `project`
labels), no shared database.

## Running locally

```bash
# backend
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python app.py            # :8091, seeds demo data on first run

# frontend (separate terminal)
cd frontend
npm install
npm run dev                        # :5176, proxies /api to :8091
```

## Data model

- **Part** — a part/lot/work order, tied to a project (plain text label).
- **StatusSnapshot** — one row per part per import: operation, S4's notes, S4's date, and when
  *we* pulled it. Current status = latest snapshot; dwell = time since `operation` last
  changed across snapshots.
- **ImportBatch** — a record of each extract pull, so the UI can honestly say "as of this
  morning's pull" instead of pretending to be live.
- **HotFlag** — an expedite request: who, why, and open → acknowledged → resolved. The one
  table with no S4 equivalent.

Import today is a paste-in (`/import`) shaped like the report described — part id, location,
notes, date, tab- or comma-separated. Swapping in a live S4 feed later only changes what calls
`POST /api/import`, not the data model.

## Status

Early scaffold — demo data seeded, core loop (view parts, see dwell, flag for expedite, import
an extract) works end to end. Not yet registered with an S4 connector; no real integration
exists.
