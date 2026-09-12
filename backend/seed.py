"""
Demo seed — two assemblies, two "S4 extract" pulls six days apart, across two projects that
also exist as real demo projects in Value Stream and Conway's Depot ("Demo: Bracket Assembly
Program", "Demo: Nacelle Fairing Retrofit") — the same cross-app-by-convention pattern those
two use for each other, not a shared database. Portfolio matches Conway's Depot's own seeded
Portfolio ("Industrial Programs") for the same reason.

Deliberately includes parts that DIDN'T move between the two pulls (the realistic case — an
extract lists every part every time, moved or not) so dwell time has something to actually
show; two open-vs-acknowledged hot flags so that flow has real data on first run; and the two
assemblies land at different %complete (0/5 vs 1/3) and different due-date urgency so the
leaderboard has something worth ranking.
"""

from datetime import date, timedelta

from db import db
from models import Assembly, HotFlag, ImportBatch, Part, StatusSnapshot, _now

DAY = timedelta(days=1)
_PORTFOLIO = "Industrial Programs"
_BKT = "Demo: Bracket Assembly Program"
_NAC = "Demo: Nacelle Fairing Retrofit"
_TERMINAL_OP = "Pack & Stage to Stock"

# part_number, assembly key, description, order_number, op six days ago, op today, notes today
_ROWS = [
    ("BKT-1001", "bkt", "Mounting bracket, machined aluminum", "WO-44210",
     "Material Issue / Kitting", "Fabrication (Cut / Machine)", None),
    ("BKT-1002", "bkt", "Mounting bracket, machined aluminum", "WO-44211",
     "Fabrication (Cut / Machine)", "Fabrication (Cut / Machine)",
     "Awaiting 2nd-op tooling — fixture in use on another job"),
    ("BKT-1003", "bkt", "Standoff, weldment", "WO-44212",
     "Joining (Weld / Braze / Bond)", "In-Process Inspection", None),
    ("BKT-1004", "bkt", "Bracket, painted assy", "WO-44213",
     "Finish (Paint / Coat / Plate)", "Finish (Paint / Coat / Plate)",
     "Paint booth backlog — 3 units ahead in queue"),
    ("BKT-1005", "bkt", "Bracket, final assy", "WO-44214",
     "Assembly", "Final Inspection & Test", None),
    ("NAC-2001", "nac", "Fairing rib, formed sheet", "WO-51002",
     "Material Issue / Kitting", "Joining (Weld / Braze / Bond)", None),
    ("NAC-2002", "nac", "Fairing panel, bonded", "WO-51003",
     "In-Process Inspection", "In-Process Inspection",
     "NDT hold — awaiting inspector availability"),
    ("NAC-2003", "nac", "Fairing assy, complete", "WO-51004",
     _TERMINAL_OP, _TERMINAL_OP,
     "Ready to ship — awaiting customer pickup slot"),
]

_HOT_FLAGS = [
    ("BKT-1002", "Sam Ortiz (PM)",
     "Need this ahead of the queue — it's blocking the CDR demo unit due next week.", None),
    ("NAC-2002", "Dana Kim (PM)",
     "Customer design review in 5 days; this needs to clear NDT before then.",
     "Production Control"),
]


def seed_if_empty():
    if Part.query.count() > 0:
        return

    today = date.today()
    assemblies = {
        "bkt": Assembly(
            name="Bracket Assembly Unit 1", project=_BKT, portfolio=_PORTFOLIO,
            due_date=today + 3 * DAY, terminal_operation=_TERMINAL_OP,
        ),
        "nac": Assembly(
            name="Nacelle Fairing Assembly 1", project=_NAC, portfolio=_PORTFOLIO,
            due_date=today + 10 * DAY, terminal_operation=_TERMINAL_OP,
        ),
    }
    db.session.add_all(assemblies.values())
    db.session.flush()

    batch_a = ImportBatch(imported_at=_now() - 6 * DAY, source_label="S4 extract", row_count=len(_ROWS))
    batch_b = ImportBatch(imported_at=_now(), source_label="S4 extract", row_count=len(_ROWS))
    db.session.add_all([batch_a, batch_b])
    db.session.flush()

    parts_by_number = {}
    for part_number, assembly_key, description, order_number, op_a, op_b, notes_b in _ROWS:
        assembly = assemblies[assembly_key]
        part = Part(
            part_number=part_number, project=assembly.project, description=description,
            order_number=order_number, assembly_id=assembly.id, created_at=batch_a.imported_at,
        )
        db.session.add(part)
        db.session.flush()
        parts_by_number[part_number] = part

        db.session.add(StatusSnapshot(
            part_id=part.id, import_batch_id=batch_a.id, operation=op_a,
            imported_at=batch_a.imported_at,
        ))
        db.session.add(StatusSnapshot(
            part_id=part.id, import_batch_id=batch_b.id, operation=op_b,
            s4_notes=notes_b, imported_at=batch_b.imported_at,
        ))

    for part_number, requested_by, reason, acknowledged_by in _HOT_FLAGS:
        flag = HotFlag(
            part_id=parts_by_number[part_number].id,
            requested_by=requested_by,
            reason=reason,
            requested_at=_now() - 1 * DAY,
        )
        if acknowledged_by:
            flag.status = "acknowledged"
            flag.acknowledged_by = acknowledged_by
            flag.acknowledged_at = _now() - timedelta(hours=6)
        db.session.add(flag)

    db.session.commit()
