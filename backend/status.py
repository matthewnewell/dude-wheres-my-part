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


def part_done(status: dict | None, terminal_operation: str | None) -> bool | None:
    """Tri-state, not a plain bool: True if the part's current operation matches the given
    terminal operation, False if it doesn't, None if there's no way to tell (no terminal
    operation declared for the assembly being asked about, or the part has no status yet).
    "Done" is always relative to whichever assembly's terminal_operation you're asking about —
    matches assembly_completion's own logic, so a part can read "done" under one assembly's view
    and "unknown" under another's if only one of them has a terminal operation set."""
    if not terminal_operation or not status:
        return None
    return status["operation"] == terminal_operation


def assembly_path(assembly) -> list:
    """Root-to-self chain of assemblies — the breadcrumb trail (top-level assembly first, this
    one last). Used for the detail page's breadcrumb and to label each part in the flatten view
    with which subassembly it actually lives in."""
    chain = []
    node = assembly
    while node is not None:
        chain.append(node)
        node = node.parent
    return list(reversed(chain))


def assembly_chain_names(part) -> list[str]:
    """Root-to-direct-assembly chain of names for a part — "Bracket Assembly Unit 1 > Fastener
    Kit > Hardware Set", not just the leaf it's directly under. [] if the part isn't assigned
    to an assembly yet. Used anywhere a part needs to show its full context at a glance (e.g.
    the Backlog page's part popup) without a separate lookup."""
    if not part.assembly:
        return []
    return [a.name for a in assembly_path(part.assembly)]


def collect_descendant_assemblies(assembly) -> list:
    """Every assembly nested under this one, at any depth — not including itself."""
    out = []
    for child in assembly.children:
        out.append(child)
        out.extend(collect_descendant_assemblies(child))
    return out


def collect_subtree_parts(assembly) -> list:
    """Every part belonging to this assembly OR any assembly nested under it, at any depth —
    the "flatten" view. A real BOM buries parts several subassembly layers down; %complete and
    risk roll up the whole subtree (below) so a top-level assembly whose parts all live in
    subassemblies still shows a real number instead of "0 of 0", and this is also exactly what
    the flatten endpoint returns for "show me every component, no drilling required.\""""
    parts = list(assembly.parts)
    for child in assembly.children:
        parts.extend(collect_subtree_parts(child))
    return parts


def assembly_completion(assembly) -> dict:
    """%complete for the leaderboard — a count of fact (parts currently sitting at the
    assembly's declared terminal operation), never a plan comparison. Honestly "unknown"
    (`pct_complete: None`) rather than guessed when the assembly has no parts yet or no
    terminal_operation has been declared for it. Rolls up every part in the subtree, not just
    this assembly's direct ones — see collect_subtree_parts."""
    parts = collect_subtree_parts(assembly)
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
    """The two signals the leaderboard sorts worst-first by: the longest any one part anywhere
    in this assembly's subtree has been sitting still, and how many open expedite requests it's
    carrying — rolled up the same way as assembly_completion."""
    worst_dwell_sec = 0.0
    open_hot_flags = 0
    for p in collect_subtree_parts(assembly):
        st = current_status(p)
        if st:
            worst_dwell_sec = max(worst_dwell_sec, st["dwell_sec"])
        open_hot_flags += sum(1 for f in p.hot_flags if f.status != "resolved")
    return {"worst_dwell_sec": worst_dwell_sec, "open_hot_flags": open_hot_flags}


def operation_constraints(parts) -> list[dict]:
    """"Where is work piling up right now" — every given part's current operation, grouped and
    counted. This is the Theory-of-Constraints view: not a per-assembly or per-part read, but
    "which operation is holding the most parts, and how long has the oldest one been sitting
    there." Same rule as everywhere else in this app: a count and a raw wall-clock dwell time,
    never a queue-vs-capacity judgment and never a comparison to an expected time. A part with
    no snapshot yet (never seen on an extract) contributes nothing — it isn't "at" anywhere."""
    groups: dict[str, dict] = {}
    for p in parts:
        st = current_status(p)
        if not st:
            continue
        g = groups.setdefault(st["operation"], {
            "operation": st["operation"],
            "part_count": 0,
            "oldest_dwell_sec": 0.0,
            "open_hot_flags": 0,
        })
        g["part_count"] += 1
        g["oldest_dwell_sec"] = max(g["oldest_dwell_sec"], st["dwell_sec"])
        g["open_hot_flags"] += sum(1 for f in p.hot_flags if f.status != "resolved")
    return sorted(groups.values(), key=lambda g: g["part_count"], reverse=True)
