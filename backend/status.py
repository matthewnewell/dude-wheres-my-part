"""Deriving "current status" and "how long has it been there" from a part's snapshot history.

Deliberately not "time in this operation vs. expected time for this operation" — there is no
expected time here, on purpose (see models.py's module docstring: the user's own routing data
is known to be historically unreliable, so this app doesn't compute a plan-vs-actual variance
or an automated "this is late" judgment anywhere). Dwell is just elapsed wall-clock time; a
person decides whether that's fine or not.
"""

from datetime import datetime, timezone


def current_status(part) -> dict | None:
    """part.snapshots must be ordered oldest -> newest (see Part.snapshots' order_by)."""
    snaps = part.snapshots
    if not snaps:
        return None

    latest = snaps[-1]
    since = latest.imported_at
    for s in reversed(snaps):
        if s.operation == latest.operation:
            since = s.imported_at
        else:
            break

    now = datetime.now(timezone.utc)
    since_aware = since if since.tzinfo else since.replace(tzinfo=timezone.utc)
    dwell_sec = max(0.0, (now - since_aware).total_seconds())

    return {
        "operation": latest.operation,
        "s4_notes": latest.s4_notes,
        "s4_date": latest.s4_date,
        "since": since.isoformat(),
        "dwell_sec": dwell_sec,
        "last_imported_at": latest.imported_at.isoformat(),
        "snapshot_count": len(snaps),
    }
