"""
Integration tests for balances and settlements.

Balance keys are always ``str(group_members.id)``. Both registered and
ghost members are addressed the same way.
"""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.group import Group, GroupMember
from app.db.models.expense import Expense, ExpenseSplit
from app.db.models.settlement import Settlement


class TestBalances:
    """Tests for balance calculations."""

    async def test_balances_empty_group(
        self, client: AsyncClient, auth_token: str, test_group: Group
    ):
        """Test balances for group with no expenses."""
        response = await client.get(
            f"/api/v1/groups/{test_group.id}/balances",
            headers={"Authorization": f"Bearer {auth_token}"},
        )

        assert response.status_code == 200
        data = response.json()
        assert "balances" in data

    async def test_balances_simple_expense(
        self,
        client: AsyncClient,
        auth_token: str,
        db_session: AsyncSession,
        test_group_with_members: tuple[Group, list[GroupMember]],
    ):
        """Test balances with a simple equal split."""
        group, members = test_group_with_members

        # Member 0 pays 90, split equally among 3 members (30 each)
        expense = Expense(
            group_id=group.id,
            created_by=members[0].user_id,
            paid_by_member_id=members[0].id,
            total_amount=90.00,
            currency=group.currency,
            note="Test",
        )
        db_session.add(expense)
        await db_session.flush()

        for member in members:
            db_session.add(ExpenseSplit(
                expense_id=expense.id,
                member_id=member.id,
                share_amount=30.00,
            ))

        await db_session.commit()

        response = await client.get(
            f"/api/v1/groups/{group.id}/balances",
            headers={"Authorization": f"Bearer {auth_token}"},
        )

        assert response.status_code == 200
        balances = response.json()["balances"]

        # Member 0 paid 90, owes 30, so net: +60
        # Members 1 and 2 each: net -30
        assert abs(balances[str(members[0].id)] - 60.00) < 0.01
        assert abs(balances[str(members[1].id)] - (-30.00)) < 0.01
        assert abs(balances[str(members[2].id)] - (-30.00)) < 0.01

    async def test_balances_multiple_expenses(
        self,
        client: AsyncClient,
        auth_token: str,
        db_session: AsyncSession,
        test_group_with_members: tuple[Group, list[GroupMember]],
    ):
        """Test balances with multiple expenses."""
        group, members = test_group_with_members

        expense1 = Expense(
            group_id=group.id,
            created_by=members[0].user_id,
            paid_by_member_id=members[0].id,
            total_amount=60.00,
            currency=group.currency,
            note="Expense 1",
        )
        db_session.add(expense1)
        await db_session.flush()
        db_session.add(ExpenseSplit(expense_id=expense1.id, member_id=members[0].id, share_amount=30.00))
        db_session.add(ExpenseSplit(expense_id=expense1.id, member_id=members[1].id, share_amount=30.00))

        expense2 = Expense(
            group_id=group.id,
            created_by=members[1].user_id,
            paid_by_member_id=members[1].id,
            total_amount=40.00,
            currency=group.currency,
            note="Expense 2",
        )
        db_session.add(expense2)
        await db_session.flush()
        db_session.add(ExpenseSplit(expense_id=expense2.id, member_id=members[0].id, share_amount=20.00))
        db_session.add(ExpenseSplit(expense_id=expense2.id, member_id=members[1].id, share_amount=20.00))

        await db_session.commit()

        response = await client.get(
            f"/api/v1/groups/{group.id}/balances",
            headers={"Authorization": f"Bearer {auth_token}"},
        )

        assert response.status_code == 200
        balances = response.json()["balances"]

        # Member 0: paid 60, owes 50, net: +10
        # Member 1: paid 40, owes 50, net: -10
        assert abs(balances[str(members[0].id)] - 10.00) < 0.01
        assert abs(balances[str(members[1].id)] - (-10.00)) < 0.01

    async def test_balances_ghost_member_pays(
        self,
        client: AsyncClient,
        auth_token: str,
        db_session: AsyncSession,
        test_group_with_members: tuple[Group, list[GroupMember]],
    ):
        """Test balances when a ghost member pays."""
        group, members = test_group_with_members
        ghost_member = members[2]

        expense = Expense(
            group_id=group.id,
            created_by=None,
            paid_by_member_id=ghost_member.id,
            total_amount=60.00,
            currency=group.currency,
            note="Ghost Pays",
        )
        db_session.add(expense)
        await db_session.flush()
        for member in members:
            db_session.add(ExpenseSplit(
                expense_id=expense.id,
                member_id=member.id,
                share_amount=20.00,
            ))
        await db_session.commit()

        response = await client.get(
            f"/api/v1/groups/{group.id}/balances",
            headers={"Authorization": f"Bearer {auth_token}"},
        )

        assert response.status_code == 200
        balances = response.json()["balances"]

        assert abs(balances[str(members[0].id)] - (-20.00)) < 0.01
        assert abs(balances[str(members[1].id)] - (-20.00)) < 0.01
        assert abs(balances[str(ghost_member.id)] - 40.00) < 0.01

    async def test_settlement_reduces_balance(
        self,
        client: AsyncClient,
        auth_token: str,
        db_session: AsyncSession,
        test_group_with_members: tuple[Group, list[GroupMember]],
    ):
        """Recording a settlement should move both members' balances toward 0."""
        group, members = test_group_with_members

        # Member 1 pays 100, split equally between 0 and 1 → member 0 owes 50.
        expense = Expense(
            group_id=group.id,
            created_by=members[1].user_id,
            paid_by_member_id=members[1].id,
            total_amount=100.00,
            currency=group.currency,
            note="Dinner",
        )
        db_session.add(expense)
        await db_session.flush()
        db_session.add(ExpenseSplit(expense_id=expense.id, member_id=members[0].id, share_amount=50.00))
        db_session.add(ExpenseSplit(expense_id=expense.id, member_id=members[1].id, share_amount=50.00))
        await db_session.commit()

        # Member 0 pays member 1 back $30 — partial settlement.
        resp = await client.post(
            f"/api/v1/groups/{group.id}/settlements",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "from_member_id": members[0].id,
                "to_member_id": members[1].id,
                "amount": 30.0,
            },
        )
        assert resp.status_code == 200, resp.text
        # currency should follow the group, not be hardcoded.
        assert resp.json()["currency"] == group.currency

        balances = (await client.get(
            f"/api/v1/groups/{group.id}/balances",
            headers={"Authorization": f"Bearer {auth_token}"},
        )).json()["balances"]

        # Before settlement: m0 = -50, m1 = +50.
        # After paying 30: m0 = -20, m1 = +20.
        assert abs(balances[str(members[0].id)] - (-20.00)) < 0.01
        assert abs(balances[str(members[1].id)] - 20.00) < 0.01

    async def test_settlement_with_ghost_member(
        self,
        client: AsyncClient,
        auth_token: str,
        db_session: AsyncSession,
        test_group_with_members: tuple[Group, list[GroupMember]],
    ):
        """A ghost member can be on either side of a settlement (no user_id)."""
        group, members = test_group_with_members
        ghost = members[2]

        # Ghost pays 60, split 3 ways → ghost +40, others -20 each.
        expense = Expense(
            group_id=group.id,
            created_by=None,
            paid_by_member_id=ghost.id,
            total_amount=60.00,
            currency=group.currency,
            note="Ghost dinner",
        )
        db_session.add(expense)
        await db_session.flush()
        for m in members:
            db_session.add(ExpenseSplit(expense_id=expense.id, member_id=m.id, share_amount=20.00))
        await db_session.commit()

        # Settle the ghost in full from member 0.
        resp = await client.post(
            f"/api/v1/groups/{group.id}/settlements",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "from_member_id": members[0].id,
                "to_member_id": ghost.id,
                "amount": 20.0,
            },
        )
        assert resp.status_code == 200, resp.text

        balances = (await client.get(
            f"/api/v1/groups/{group.id}/balances",
            headers={"Authorization": f"Bearer {auth_token}"},
        )).json()["balances"]
        assert abs(balances[str(members[0].id)] - 0.00) < 0.01
        assert abs(balances[str(ghost.id)] - 20.00) < 0.01  # still owed by member 1


class TestSettlements:
    """Settlement suggestions and validation."""

    async def test_settlements_suggestions_shape(
        self,
        client: AsyncClient,
        auth_token: str,
        db_session: AsyncSession,
        test_group_with_members: tuple[Group, list[GroupMember]],
    ):
        """Suggestions return member_id-keyed transfers."""
        group, members = test_group_with_members

        expense = Expense(
            group_id=group.id,
            created_by=members[1].user_id,
            paid_by_member_id=members[1].id,
            total_amount=100.00,
            currency=group.currency,
            note="Test",
        )
        db_session.add(expense)
        await db_session.flush()
        db_session.add(ExpenseSplit(expense_id=expense.id, member_id=members[0].id, share_amount=50.00))
        db_session.add(ExpenseSplit(expense_id=expense.id, member_id=members[1].id, share_amount=50.00))
        await db_session.commit()

        response = await client.get(
            f"/api/v1/groups/{group.id}/settlements/suggestions",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 1
        s = data[0]
        assert s["from_member_id"] == members[0].id
        assert s["to_member_id"] == members[1].id
        assert abs(s["amount"] - 50.00) < 0.01

    async def test_settlement_rejects_cross_group_member(
        self,
        client: AsyncClient,
        auth_token: str,
        test_group_with_members: tuple[Group, list[GroupMember]],
    ):
        """from/to must belong to the group on the URL."""
        group, members = test_group_with_members
        resp = await client.post(
            f"/api/v1/groups/{group.id}/settlements",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"from_member_id": members[0].id, "to_member_id": 99999, "amount": 10.0},
        )
        assert resp.status_code == 400
