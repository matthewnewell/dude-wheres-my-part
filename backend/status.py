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


def assembly_completion(assembly) -> dict:
    """%complete for the leaderboard — a count of fact (parts currently sitting at the
    assembly's declared terminal operation), never a plan comparison. Honestly "unknown"
    (`pct_complete: None`) rather than guessed when the assembly has no parts yet or no
    terminal_operation has been declared for it."""
    parts = assembly.parts
    total = len(parts)
    if total == 0:
        return {"total_parts": 0, "complete_parts": None, "pct_complete": None}
    if not assembly.terminal_operation:
        return {"total_parts": total, "complete_parts": None, "pct_complete": None}

    complete = 0
    for p in parts:
        st = current_status(p)
        if st and st["operation"] == assembly.terminal_operation:
            complete += 1
    return {
        "total_parts": total,
        "complete_parts": complete,
        "pct_complete": round(100 * complete / total, 1),
    }


def assembly_risk(assembly) -> dict:
    """The two signals the leaderboard sorts worst-first by: the longest any one of this
    assembly's parts has been sitting still, and how many open expedite requests it's carrying."""
    worst_dwell_sec = 0.0
    open_hot_flags = 0
    for p in assembly.parts:
        st = current_status(p)
        if st:
            worst_dwell_sec = max(worst_dwell_sec, st["dwell_sec"])
        open_hot_flags += sum(1 for f in p.hot_flags if f.status != "resolved")
    return {"worst_dwell_sec": worst_dwell_sec, "open_hot_flags": open_hot_flags}
