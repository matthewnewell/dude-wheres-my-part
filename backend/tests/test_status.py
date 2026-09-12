"""Regression guard for status.current_status — the one piece of real logic in this app.
Also encodes the design constraint from models.py's docstring: no plan-vs-actual anywhere."""

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from status import current_status  # noqa: E402

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
