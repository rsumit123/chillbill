"""Tests for the natural-language expense-parse endpoint.

The LLM call is mocked so tests are deterministic and don't require OPENROUTER_API_KEY.
"""
import pytest
from unittest.mock import AsyncMock, patch


class TestExpenseParse:
    async def test_parse_returns_expense_for_well_formed_input(
        self, client, auth_token, test_group_with_members
    ):
        group, members = test_group_with_members
        m_ids = [m.id for m in members]

        mocked = {
            "intent": "expense",
            "confidence": "high",
            "expense": {
                "total_amount": 1200.0,
                "currency": group.currency,
                "note": "Dinner",
                "paid_by_member_id": m_ids[0],
                "split_mode": "equal",
                "splits": [
                    {"member_id": m_ids[0], "share_amount": 400.0},
                    {"member_id": m_ids[1], "share_amount": 400.0},
                    {"member_id": m_ids[2], "share_amount": 400.0},
                ],
            },
            "settlement": None,
        }

        with patch("app.api.v1.expenses.parse_expense_text",
                   new=AsyncMock(return_value=mocked)):
            resp = await client.post(
                f"/api/v1/groups/{group.id}/expenses/parse",
                headers={"Authorization": f"Bearer {auth_token}"},
                json={"text": "Dinner 1200 split 3 ways"},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["intent"] == "expense"
        assert data["expense"]["total_amount"] == 1200.0

    async def test_parse_returns_settlement(self, client, auth_token, test_group_with_members):
        group, members = test_group_with_members
        m_ids = [m.id for m in members]

        mocked = {
            "intent": "settlement",
            "confidence": "high",
            "expense": None,
            "settlement": {
                "from_member_id": m_ids[0],
                "to_member_id": m_ids[1],
                "amount": 500.0,
                "note": "",
            },
        }

        with patch("app.api.v1.expenses.parse_expense_text",
                   new=AsyncMock(return_value=mocked)):
            resp = await client.post(
                f"/api/v1/groups/{group.id}/expenses/parse",
                headers={"Authorization": f"Bearer {auth_token}"},
                json={"text": "Paid Aarav back 500"},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["intent"] == "settlement"
        assert data["settlement"]["amount"] == 500.0

    async def test_parse_returns_unknown_on_validation_failure(
        self, client, auth_token, test_group_with_members
    ):
        group, _members = test_group_with_members
        # The service's _validate will turn the response into 'unknown' itself.
        with patch("app.api.v1.expenses.parse_expense_text",
                   new=AsyncMock(return_value={"intent": "unknown", "confidence": "low",
                                                "expense": None, "settlement": None,
                                                "error": "payer is not a member"})):
            resp = await client.post(
                f"/api/v1/groups/{group.id}/expenses/parse",
                headers={"Authorization": f"Bearer {auth_token}"},
                json={"text": "garbage"},
            )
        assert resp.status_code == 200
        assert resp.json()["intent"] == "unknown"

    async def test_parse_requires_membership(self, client, auth_token):
        # Bogus group id — should 403/404
        resp = await client.post(
            "/api/v1/groups/nonexistent/expenses/parse",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"text": "x"},
        )
        assert resp.status_code in (403, 404)

    async def test_parse_rejects_empty_text(self, client, auth_token, test_group_with_members):
        group, _ = test_group_with_members
        # Empty text bypasses the LLM (parse_expense_text returns unknown without calling LLM),
        # so no mock is needed.
        resp = await client.post(
            f"/api/v1/groups/{group.id}/expenses/parse",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"text": ""},
        )
        assert resp.status_code == 200
        assert resp.json()["intent"] == "unknown"
