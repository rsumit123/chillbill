"""Unit tests for next_monthly_date — pure function, month clamping + rollover."""
from datetime import date

import pytest

from app.services.recurring_expenses import next_monthly_date


class TestNextMonthlyDate:
    def test_simple_next_month(self):
        assert next_monthly_date(date(2026, 1, 15), 15) == date(2026, 2, 15)

    def test_dec_to_jan_year_rollover(self):
        assert next_monthly_date(date(2026, 12, 1), 1) == date(2027, 1, 1)

    def test_dom_31_clamps_in_feb_non_leap(self):
        assert next_monthly_date(date(2026, 1, 31), 31) == date(2026, 2, 28)

    def test_dom_31_clamps_in_feb_leap(self):
        # 2028 is a leap year.
        assert next_monthly_date(date(2028, 1, 31), 31) == date(2028, 2, 29)

    def test_dom_restores_in_month_after_clamp(self):
        # After clamping to Feb 28 with dom=31, the March run should be 31.
        assert next_monthly_date(date(2026, 2, 28), 31) == date(2026, 3, 31)

    def test_dom_31_clamps_in_april(self):
        assert next_monthly_date(date(2026, 3, 31), 31) == date(2026, 4, 30)

    def test_dom_1_always_first(self):
        assert next_monthly_date(date(2026, 4, 30), 1) == date(2026, 5, 1)
