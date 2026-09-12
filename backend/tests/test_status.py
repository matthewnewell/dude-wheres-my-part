"""Regression guard for status.current_status — the one piece of real logic in this app.
Also encodes the design constraint from models.py's docstring: no plan-vs-actual anywhere."""

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from status import assembly_chain_names, assembly_path, collect_subtree_parts, current_status, part_done  # noqa: E402

NOW = datetime.now(timezone.utc)


def snap(operation, days_ago, notes=None):
    return SimpleNamespace(
        operation=operation, s4_notes=notes, s4_date=None,
        imported_at=NOW - timedelta(days=days_ago),
    )


def part(snapshots):
    return SimpleNamespace(snapshots=snapshots)


def test_no_snapshots_is_none():
    assert current_status(part([])) is None


def test_dwell_is_since_the_operation_last_changed_not_since_last_import():
    # Three pulls: moved to Weld 6 days ago, stayed there through today's pull.
    p = part([snap("Kitting", 12), snap("Weld", 6), snap("Weld", 0)])
    st = current_status(p)
    assert st["operation"] == "Weld"
    assert abs(st["dwell_sec"] - 6 * 86400) < 5


def test_dwell_resets_when_operation_changes():
    p = part([snap("Kitting", 6), snap("Weld", 0)])
    st = current_status(p)
    assert st["operation"] == "Weld"
    assert st["dwell_sec"] < 5


def test_notes_and_date_come_from_the_latest_snapshot_only():
    p = part([snap("Kitting", 6, notes="old note"), snap("Weld", 0, notes="fresh note")])
    st = current_status(p)
    assert st["s4_notes"] == "fresh note"


# ── Subassembly tree helpers ───────────────────────────────────────────────────────────────

def asm(name, parent=None, parts=None, children=None):
    a = SimpleNamespace(name=name, parent=parent, parts=parts or [], children=children or [])
    for child in a.children:
        child.parent = a
    return a


def test_assembly_path_is_root_to_self():
    root = asm("Top")
    mid = asm("Mid", parent=root)
    leaf = asm("Leaf", parent=mid)
    assert [a.name for a in assembly_path(leaf)] == ["Top", "Mid", "Leaf"]


def test_assembly_path_of_top_level_is_just_itself():
    root = asm("Top")
    assert [a.name for a in assembly_path(root)] == ["Top"]


def test_collect_subtree_parts_rolls_up_every_depth():
    grandchild = asm("Hardware Set", parts=["p3"])
    child = asm("Fastener Kit", parts=["p2"], children=[grandchild])
    root = asm("Bracket Assembly", parts=["p1"], children=[child])
    assert collect_subtree_parts(root) == ["p1", "p2", "p3"]


def test_collect_subtree_parts_of_leaf_is_just_its_own():
    leaf = asm("Hardware Set", parts=["p1"])
    assert collect_subtree_parts(leaf) == ["p1"]


def test_assembly_chain_names_is_root_to_direct_assembly():
    root = asm("Bracket Assembly")
    mid = asm("Fastener Kit", parent=root)
    leaf = asm("Hardware Set", parent=mid)
    p = SimpleNamespace(assembly=leaf)
    assert assembly_chain_names(p) == ["Bracket Assembly", "Fastener Kit", "Hardware Set"]


def test_assembly_chain_names_empty_when_unassigned():
    p = SimpleNamespace(assembly=None)
    assert assembly_chain_names(p) == []


# ── part_done: tri-state, relative to whichever terminal_operation you ask about ──────────────

def test_part_done_true_when_operation_matches():
    assert part_done({"operation": "Ship"}, "Ship") is True


def test_part_done_false_when_operation_differs():
    assert part_done({"operation": "Weld"}, "Ship") is False


def test_part_done_unknown_when_no_terminal_operation():
    assert part_done({"operation": "Ship"}, None) is None


def test_part_done_unknown_when_no_status_yet():
    assert part_done(None, "Ship") is None
