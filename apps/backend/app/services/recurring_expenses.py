"""Recurring expense rule materialization.

Contains:
- next_monthly_date: pure function advancing a date by one month, clamping day-of-month.
Additional helpers (create_rule_from_payload, materialize_due_rules) added in later tasks.
"""
from __future__ import annotations

import calendar
import logging
from datetime import date


logger = logging.getLogger(__name__)


def next_monthly_date(prev: date, day_of_month: int) -> date:
    """Advance `prev` by one calendar month; clamp `day_of_month` to the new month's length.

    The stored `day_of_month` (1-31) is NOT mutated by clamping — this function only
    returns the correct next run date. So dom=31 in Feb yields Feb 28/29, but the rule
    still targets 31, restoring in March.
    """
    if prev.month < 12:
        y, m = prev.year, prev.month + 1
    else:
        y, m = prev.year + 1, 1
    last_day = calendar.monthrange(y, m)[1]
    return date(y, m, min(day_of_month, last_day))
