"""
Demo seed — two "S4 extract" pulls, six days apart, across two projects that also exist as
real demo projects in Value Stream and Conway's Depot ("Demo: Bracket Assembly Program",
"Demo: Nacelle Fairing Retrofit") — the same cross-app-by-convention pattern those two use for
each other, not a shared database.

Deliberately includes parts that DIDN'T move between the two pulls (the realistic case — an
extract lists every part every time, moved or not) so dwell time has something to actually
show, plus two open-vs-acknowledged hot flags so that flow has real data on first run too.
"""

from datetime import timedelta

from db import db
from models import HotFlag, ImportBatch, Part, StatusSnapshot, _now

DAY = timedelta(days=1)

_BKT = "Demo: Bracket Assembly Program"
_NAC = "Demo: Nacelle Fairing Retrofit"

# part_number, project, description, order_number, op six days ago, op today, notes today
_ROWS = [
    ("BKT-1001", _BKT, "Mounting bracket, machined aluminum", "WO-44210",
     "Material Issue / Kitting", "Fabrication (Cut / Machine)", None),
    ("BKT-1002", _BKT, "Mounting bracket, machined aluminum", "WO-44211",
     "Fabrication (Cut / Machine)", "Fabrication (Cut / Machine)",
     "Awaiting 2nd-op tooling — fixture in use on another job"),
    ("BKT-1003", _BKT, "Standoff, weldment", "WO-44212",
     "Joining (Weld / Braze / Bond)", "In-Process Inspection", None),
    ("BKT-1004", _BKT, "Bracket, painted assy", "WO-44213",
     "Finish (Paint / Coat / Plate)", "Finish (Paint / Coat / Plate)",
     "Paint booth backlog — 3 units ahead in queue"),
    ("BKT-1005", _BKT, "Bracket, final assy", "WO-44214",
     "Assembly", "Final Inspection & Test", None),
    ("NAC-2001", _NAC, "Fairing rib, formed sheet", "WO-51002",
     "Material Issue / Kitting", "Joining (Weld / Braze / Bond)", None),
    ("NAC-2002", _NAC, "Fairing panel, bonded", "WO-51003",
     "In-Process Inspection", "In-Process Inspection",
     "NDT hold — awaiting inspector availability"),
    ("NAC-2003", _NAC, "Fairing assy, complete", "WO-51004",
     "Pack & Stage to Stock", "Pack & Stage to Stock",
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

    batch_a = ImportBatch(imported_at=_now() - 6 * DAY, source_label="S4 extract", row_count=len(_ROWS))
    batch_b = ImportBatch(imported_at=_now(), source_label="S4 extract", row_count=len(_ROWS))
    db.session.add_all([batch_a, batch_b])
    db.session.flush()

    parts_by_number = {}
    for part_number, project, description, order_number, op_a, op_b, notes_b in _ROWS:
        part = Part(
            part_number=part_number, project=project, description=description,
            order_number=order_number, created_at=batch_a.imported_at,
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
