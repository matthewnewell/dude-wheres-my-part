"""
Models: Part, StatusSnapshot, ImportBatch, HotFlag.

The core idea: this app is NOT a system of record for where a part is — S4 already is that,
however badly. What DWMP owns is turning an on-demand, flat S4 extract (part id, operation,
notes, date) into something you can browse without asking someone to go pull a report, plus
the one thing that extract never had: a shared, visible expedite/hot-flag list.

Each import of that extract writes one StatusSnapshot per part, tagged with when *we* pulled
it (`imported_at`) as well as whatever date S4's row carried (`s4_date`) — the app is only ever
as fresh as the last import, and says so, rather than pretending to be live. "Current status"
for a part is its latest snapshot; "how long has it been here" is computed by walking back
through consecutive snapshots with the same `operation` value, not by comparing against a
planned routing or expected time per operation — the user's own routing data is known to run
"historically very off", so DWMP deliberately never computes a plan-vs-actual variance or an
automated "this is late" judgment. It shows the raw dwell time and lets a person decide.

Assembly / Portfolio layer: a part belongs to an Assembly, and an Assembly carries the
`project` and `portfolio` labels (a Part still has its own `project` too, as a fallback for a
part an extract created that hasn't been triaged into an assembly yet). This exists because
reprioritization authority tracks the hierarchy, not a flat part list — a portfolio owner
comparing assemblies across their own projects is who actually has standing to say "this one
jumps the queue," which is a level above where a single part's hot flag lives.
`Assembly.terminal_operation` is the one deliberately narrow piece of routing knowledge this
app allows itself: not a full ordered routing (still refuses that — see above), just "which
operation means this part is done," optionally set per assembly, used only to compute the
leaderboard's %complete — a fact, not a plan comparison. Left unset, %complete is honestly
unknown rather than guessed.

An Assembly can itself contain child Assemblies (`parent_assembly_id`, self-referential) —
subassemblies, sub-subassemblies, as deep as a real BOM actually goes. The leaderboard only
ever lists top-level assemblies (`parent_assembly_id IS NULL`) — what a project actually
follows; a subassembly surfaces only when you drill into its parent. `%complete`/risk always
roll up the *whole* subtree (see `status.collect_subtree_parts`), not just an assembly's direct
parts, so a top-level assembly whose parts all live several subassembly layers down still shows
a real number instead of "0 of 0." The "flatten" view (`GET /assemblies/<id>/flatten`) is the
other side of that: every part anywhere under an assembly, in one flat list, each carrying the
subassembly path it actually lives in — for when you just want to see every component without
clicking through the tree one level at a time.
"""

from datetime import datetime, timezone

from db import _uuid, db


def _now():
    return datetime.now(timezone.utc)


HOT_FLAG_STATUSES = ("open", "acknowledged", "resolved")


class ImportBatch(db.Model):
    """One pull of the S4 extract. A record of *when* the data underneath every part's
    "current status" was actually as-of — surfaced in the UI so nobody mistakes this for a
    live feed."""

    __tablename__ = "import_batch"

    id = db.Column(db.String(36), primary_key=True, default=_uuid)
    imported_at = db.Column(db.DateTime, default=_now, nullable=False)
    # Free text — "S4 extract", "manual paste", etc. Not load-bearing, just provenance.
    source_label = db.Column(db.String(120), nullable=True)
    row_count = db.Column(db.Integer, default=0, nullable=False)

    snapshots = db.relationship(
        "StatusSnapshot", backref="import_batch", cascade="all, delete-orphan", lazy="select"
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "imported_at": self.imported_at.isoformat(),
            "source_label": self.source_label,
            "row_count": self.row_count,
        }


class Assembly(db.Model):
    """A top-level built item — what a part is a subassembly *of*. Owns the `project` and
    `portfolio` labels (plain text, same cross-app-by-convention pattern as everywhere else in
    this ecosystem); the leaderboard is the list of these, ranked by what needs attention."""

    __tablename__ = "assembly"

    id = db.Column(db.String(36), primary_key=True, default=_uuid)
    name = db.Column(db.String(200), nullable=False)
    project = db.Column(db.String(200), nullable=True, index=True)
    portfolio = db.Column(db.String(200), nullable=True, index=True)
    due_date = db.Column(db.Date, nullable=True)
    # Which S4 `operation` value means "this part is done" — see the module docstring. Optional;
    # %complete is honestly "unknown" rather than guessed when it's not set.
    terminal_operation = db.Column(db.String(200), nullable=True)
    # Self-referential — see the module docstring's subassembly section. Null = top-level, the
    # only kind the leaderboard lists directly.
    parent_assembly_id = db.Column(db.String(36), db.ForeignKey("assembly.id"), nullable=True, index=True)
    created_at = db.Column(db.DateTime, default=_now, nullable=False)

    parts = db.relationship("Part", backref="assembly", lazy="selectin", order_by="Part.part_number")
    children = db.relationship(
        "Assembly",
        backref=db.backref("parent", remote_side=[id]),
        lazy="selectin",
        order_by="Assembly.name",
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "project": self.project,
            "portfolio": self.portfolio,
            "due_date": self.due_date.isoformat() if self.due_date else None,
            "terminal_operation": self.terminal_operation,
            "parent_assembly_id": self.parent_assembly_id,
            "created_at": self.created_at.isoformat(),
            "part_count": len(self.parts),  # direct parts only — see collect_subtree_parts for the rolled-up count
            "child_count": len(self.children),
        }


class Part(db.Model):
    """A specific part/lot/work order moving through the shop. `assembly_id` is nullable — a
    part an extract created is a real part before anyone's had a chance to triage it into an
    assembly. `project` is that same part's own plain-text fallback label for exactly that
    not-yet-triaged case; once assigned to an assembly, the assembly's `project`/`portfolio` are
    what the hierarchy views (leaderboard, assembly detail) actually use."""

    __tablename__ = "part"

    id = db.Column(db.String(36), primary_key=True, default=_uuid)
    part_number = db.Column(db.String(80), nullable=False, index=True)
    description = db.Column(db.String(300), nullable=True)
    project = db.Column(db.String(200), nullable=True, index=True)
    order_number = db.Column(db.String(80), nullable=True)
    assembly_id = db.Column(db.String(36), db.ForeignKey("assembly.id"), nullable=True, index=True)
    created_at = db.Column(db.DateTime, default=_now, nullable=False)

    snapshots = db.relationship(
        "StatusSnapshot",
        backref="part",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="StatusSnapshot.imported_at",
    )
    hot_flags = db.relationship(
        "HotFlag",
        backref="part",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="HotFlag.requested_at.desc()",
    )

    def to_dict(self, include_snapshots: bool = False) -> dict:
        d = {
            "id": self.id,
            "part_number": self.part_number,
            "description": self.description,
            "project": self.assembly.project if self.assembly else self.project,
            "order_number": self.order_number,
            "assembly_id": self.assembly_id,
            "assembly_name": self.assembly.name if self.assembly else None,
            "created_at": self.created_at.isoformat(),
        }
        if include_snapshots:
            d["snapshots"] = [s.to_dict() for s in self.snapshots]
            d["hot_flags"] = [h.to_dict() for h in self.hot_flags]
        return d


class StatusSnapshot(db.Model):
    """One row of the S4 extract, for one part, as of one import. `operation` is whatever S4
    called the current manufacturing step ("Weld", "Paint Booth 2", ...) — free text, not an
    enum, because that's exactly the shape of what actually comes out of the report."""

    __tablename__ = "status_snapshot"

    id = db.Column(db.String(36), primary_key=True, default=_uuid)
    part_id = db.Column(db.String(36), db.ForeignKey("part.id"), nullable=False, index=True)
    import_batch_id = db.Column(
        db.String(36), db.ForeignKey("import_batch.id"), nullable=False, index=True
    )

    operation = db.Column(db.String(200), nullable=False)
    s4_notes = db.Column(db.Text, nullable=True)
    # The date S4's own row carried — a string, deliberately: extracts are inconsistent about
    # date format and DWMP has no business normalizing or trusting it as a hard timestamp.
    s4_date = db.Column(db.String(40), nullable=True)
    imported_at = db.Column(db.DateTime, default=_now, nullable=False, index=True)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "part_id": self.part_id,
            "import_batch_id": self.import_batch_id,
            "operation": self.operation,
            "s4_notes": self.s4_notes,
            "s4_date": self.s4_date,
            "imported_at": self.imported_at.isoformat(),
        }


class HotFlag(db.Model):
    """A request to expedite a part — the one thing the S4 extract never carries. Deliberately
    simple: no priority levels or workflow states beyond open -> acknowledged -> resolved.
    The point is visibility (one place the floor can see who's asking and why), not a ticketing
    system."""

    __tablename__ = "hot_flag"

    id = db.Column(db.String(36), primary_key=True, default=_uuid)
    part_id = db.Column(db.String(36), db.ForeignKey("part.id"), nullable=False, index=True)

    requested_by = db.Column(db.String(120), nullable=False)
    reason = db.Column(db.Text, nullable=False)
    requested_at = db.Column(db.DateTime, default=_now, nullable=False)

    status = db.Column(db.String(20), nullable=False, default="open")  # see HOT_FLAG_STATUSES
    acknowledged_by = db.Column(db.String(120), nullable=True)
    acknowledged_at = db.Column(db.DateTime, nullable=True)
    resolved_at = db.Column(db.DateTime, nullable=True)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "part_id": self.part_id,
            "requested_by": self.requested_by,
            "reason": self.reason,
            "requested_at": self.requested_at.isoformat(),
            "status": self.status,
            "acknowledged_by": self.acknowledged_by,
            "acknowledged_at": self.acknowledged_at.isoformat() if self.acknowledged_at else None,
            "resolved_at": self.resolved_at.isoformat() if self.resolved_at else None,
        }
