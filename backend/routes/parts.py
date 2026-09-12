from flask import Blueprint, jsonify, request

from db import db
from models import HOT_FLAG_STATUSES, Assembly, HotFlag, ImportBatch, Part, StatusSnapshot, _now
from status import (
    assembly_chain_names,
    assembly_completion,
    assembly_path,
    assembly_risk,
    collect_subtree_parts,
    current_status,
    operation_constraints,
    part_done,
)

bp = Blueprint("parts", __name__, url_prefix="/api")


@bp.get("/assemblies")
def list_assemblies():
    """The leaderboard: every *top-level* assembly (no parent) with its computed %complete and
    risk signals, rolled up across its whole subassembly subtree. `?project=` and `?portfolio=`
    scope it — a project follows its own assemblies, a portfolio owner (or nobody, i.e. the
    default) sees everything to compare across projects. Subassemblies never show up here —
    only when you drill into their parent."""
    q = Assembly.query.filter(Assembly.parent_assembly_id.is_(None))
    if project := request.args.get("project"):
        q = q.filter(Assembly.project == project)
    if portfolio := request.args.get("portfolio"):
        q = q.filter(Assembly.portfolio == portfolio)

    out = []
    for a in q.all():
        d = a.to_dict()
        d["completion"] = assembly_completion(a)
        d.update(assembly_risk(a))
        out.append(d)
    return jsonify(out)


@bp.post("/assemblies")
def create_assembly():
    """Create a top-level assembly, or a subassembly when `parent_assembly_id` is given."""
    body = request.get_json(force=True) or {}
    name = (body.get("name") or "").strip()
    if not name:
        return jsonify({"error": "name is required"}), 400

    parent = None
    if parent_id := body.get("parent_assembly_id"):
        parent = Assembly.query.get_or_404(parent_id)

    assembly = Assembly(
        name=name,
        # A subassembly inherits its parent's project/portfolio by default — it's part of the
        # same build — but an explicit value in the body still wins.
        project=(body.get("project") or "").strip() or (parent.project if parent else None) or None,
        portfolio=(body.get("portfolio") or "").strip() or (parent.portfolio if parent else None) or None,
        due_date=body.get("due_date") or None,
        terminal_operation=(body.get("terminal_operation") or "").strip() or None,
        parent_assembly_id=parent.id if parent else None,
    )
    db.session.add(assembly)
    db.session.commit()
    return jsonify(assembly.to_dict()), 201


@bp.get("/assemblies/<assembly_id>")
def get_assembly(assembly_id):
    """Direct children (subassemblies, each with their own rolled-up completion/risk) and
    direct parts only — the tree view, one level at a time. `ancestors` is the root-to-self
    breadcrumb; use GET /assemblies/<id>/flatten for every part at any depth in one list."""
    a = Assembly.query.get_or_404(assembly_id)
    d = a.to_dict()
    d["completion"] = assembly_completion(a)
    d.update(assembly_risk(a))
    d["ancestors"] = [anc.to_dict() for anc in assembly_path(a)[:-1]]

    d["children"] = []
    for child in a.children:
        cd = child.to_dict()
        cd["completion"] = assembly_completion(child)
        cd.update(assembly_risk(child))
        d["children"].append(cd)

    d["parts"] = []
    for p in a.parts:
        pd = p.to_dict()
        pd["status"] = current_status(p)
        pd["open_hot_flags"] = sum(1 for f in p.hot_flags if f.status != "resolved")
        pd["done"] = part_done(pd["status"], a.terminal_operation)
        d["parts"].append(pd)
    return jsonify(d)


@bp.get("/assemblies/<assembly_id>/flatten")
def flatten_assembly(assembly_id):
    """Every part anywhere under this assembly, at any depth, in one flat list — for when you
    just want to see every component instead of drilling into each subassembly one level at a
    time. Each part carries `assembly_path`: the subassembly chain (root at this assembly) it
    actually lives in, so "flat" doesn't mean "you lose track of where it came from.\""""
    a = Assembly.query.get_or_404(assembly_id)
    out = []
    for p in collect_subtree_parts(a):
        pd = p.to_dict()
        pd["status"] = current_status(p)
        pd["open_hot_flags"] = sum(1 for f in p.hot_flags if f.status != "resolved")
        # "Done" relative to THIS assembly's terminal operation, same as its own %complete —
        # not the part's own direct (sub)assembly's, so the number you see here always agrees
        # with the %complete stat at the top of the page you're looking at.
        pd["done"] = part_done(pd["status"], a.terminal_operation)
        # Path from THIS assembly down to the part's direct owner, not all the way to the root.
        full_path = assembly_path(p.assembly)
        start = next((i for i, node in enumerate(full_path) if node.id == a.id), 0)
        pd["assembly_path"] = [node.name for node in full_path[start:]]
        out.append(pd)
    out.sort(key=lambda pd: (pd["status"]["dwell_sec"] if pd["status"] else 0), reverse=True)
    return jsonify(out)


@bp.get("/portfolios")
def list_portfolios():
    rows = db.session.query(Assembly.portfolio).filter(Assembly.portfolio.isnot(None)).distinct().all()
    return jsonify(sorted({r[0] for r in rows}))


@bp.get("/parts")
def list_parts():
    """Every part, with its computed current status, open-hot-flag count, and full assembly
    chain (root-to-direct-assembly names — see assembly_chain_names). `?project=` filters to
    one project's parts — a PM's own view instead of the whole shop's."""
    project = request.args.get("project")
    q = Part.query
    if project:
        q = q.filter(Part.project == project)
    parts = q.order_by(Part.part_number).all()

    out = []
    for p in parts:
        d = p.to_dict()
        d["status"] = current_status(p)
        d["open_hot_flags"] = sum(1 for h in p.hot_flags if h.status != "resolved")
        d["assembly_chain"] = assembly_chain_names(p)
        out.append(d)
    return jsonify(out)


@bp.get("/parts/<part_id>")
def get_part(part_id):
    p = Part.query.get_or_404(part_id)
    d = p.to_dict(include_snapshots=True)
    d["status"] = current_status(p)
    d["assembly_chain"] = assembly_chain_names(p)
    return jsonify(d)


@bp.get("/constraints")
def list_constraints():
    """Where work is piling up right now: every currently-tracked part's operation, grouped and
    counted, worst (most parts) first. `?project=` scopes it the same way /parts does."""
    project = request.args.get("project")
    q = Part.query
    if project:
        q = q.filter(Part.project == project)
    return jsonify(operation_constraints(q.all()))


@bp.get("/projects")
def list_projects():
    """Distinct project labels seen across parts — powers the filter dropdown."""
    rows = db.session.query(Part.project).filter(Part.project.isnot(None)).distinct().all()
    return jsonify(sorted({r[0] for r in rows}))


@bp.get("/import-batches")
def list_import_batches():
    """Most recent first — the banner ("as of this morning's extract") reads the first one."""
    batches = ImportBatch.query.order_by(ImportBatch.imported_at.desc()).limit(20).all()
    return jsonify([b.to_dict() for b in batches])


def _validate_import_row(row: dict) -> str | None:
    if not (row.get("part_number") or "").strip():
        return "each row needs a part_number"
    if not (row.get("operation") or "").strip():
        return "each row needs an operation"
    return None


@bp.post("/import")
def import_extract():
    """Ingest an on-demand S4-style extract: {source_label, rows: [{part_number, operation,
    notes, date, project, order_number, description}, ...]}. One StatusSnapshot per row, tagged
    with this batch; a part_number not seen before creates a new Part. Never touches parts NOT
    present in this extract — an import is additive, not a full resync (a part missing from
    today's pull doesn't mean it vanished, it might just not have moved)."""
    body = request.get_json(force=True) or {}
    rows = body.get("rows")
    if not isinstance(rows, list) or not rows:
        return jsonify({"error": "rows must be a non-empty list"}), 400

    for i, row in enumerate(rows):
        if err := _validate_import_row(row):
            return jsonify({"error": f"row {i + 1}: {err}"}), 400

    batch = ImportBatch(source_label=(body.get("source_label") or "S4 extract").strip(), row_count=len(rows))
    db.session.add(batch)
    db.session.flush()

    imported_at = _now()
    created_parts = 0
    for row in rows:
        part_number = row["part_number"].strip()
        part = Part.query.filter_by(part_number=part_number).first()
        if part is None:
            part = Part(
                part_number=part_number,
                description=(row.get("description") or "").strip() or None,
                project=(row.get("project") or "").strip() or None,
                order_number=(row.get("order_number") or "").strip() or None,
            )
            db.session.add(part)
            db.session.flush()
            created_parts += 1
        else:
            # An extract row can carry fresher project/order/description context than what we
            # have on file — update it, but only when the row actually says something.
            if row.get("project"):
                part.project = row["project"].strip()
            if row.get("order_number"):
                part.order_number = row["order_number"].strip()
            if row.get("description"):
                part.description = row["description"].strip()

        db.session.add(StatusSnapshot(
            part_id=part.id,
            import_batch_id=batch.id,
            operation=row["operation"].strip(),
            s4_notes=(row.get("notes") or "").strip() or None,
            s4_date=(row.get("date") or "").strip() or None,
            imported_at=imported_at,
        ))

    db.session.commit()
    return jsonify({**batch.to_dict(), "parts_created": created_parts}), 201


@bp.post("/parts/<part_id>/hot-flags")
def create_hot_flag(part_id):
    Part.query.get_or_404(part_id)
    body = request.get_json(force=True) or {}
    requested_by = (body.get("requested_by") or "").strip()
    reason = (body.get("reason") or "").strip()
    if not requested_by or not reason:
        return jsonify({"error": "requested_by and reason are required"}), 400

    flag = HotFlag(part_id=part_id, requested_by=requested_by, reason=reason)
    db.session.add(flag)
    db.session.commit()
    return jsonify(flag.to_dict()), 201


@bp.put("/hot-flags/<flag_id>")
def update_hot_flag(flag_id):
    """Move a flag through open -> acknowledged -> resolved. Acknowledging without a name is
    meaningless (the whole point is "who's on it"), so require it."""
    flag = HotFlag.query.get_or_404(flag_id)
    body = request.get_json(force=True) or {}
    status = body.get("status")
    if status not in HOT_FLAG_STATUSES:
        return jsonify({"error": f"status must be one of {HOT_FLAG_STATUSES}"}), 400

    if status == "acknowledged":
        acknowledged_by = (body.get("acknowledged_by") or "").strip()
        if not acknowledged_by:
            return jsonify({"error": "acknowledged_by is required to acknowledge a flag"}), 400
        flag.acknowledged_by = acknowledged_by
        flag.acknowledged_at = _now()
    elif status == "resolved":
        flag.resolved_at = _now()

    flag.status = status
    db.session.commit()
    return jsonify(flag.to_dict())
