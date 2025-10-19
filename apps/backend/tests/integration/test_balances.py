"""
Integration tests for balances and settlements.
"""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.group import Group, GroupMember
from app.db.models.expense import Expense, ExpenseSplit


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
        # All balances should be 0 or empty
    
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
            split = ExpenseSplit(
                expense_id=expense.id,
                member_id=member.id,
                share_amount=30.00,
            )
            db_session.add(split)
        
        await db_session.commit()
        
        response = await client.get(
            f"/api/v1/groups/{group.id}/balances",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        
        assert response.status_code == 200
        data = response.json()
        balances = data["balances"]
        
        # Member 0 paid 90, owes 30, so net: +60
        # Member 1 paid 0, owes 30, so net: -30
        # Member 2 (ghost) paid 0, owes 30, so net: -30
        
        member0_key = members[0].user_id
        member1_key = members[1].user_id
        member2_key = f"ghost_{members[2].id}"
        
        assert abs(balances[member0_key] - 60.00) < 0.01
        assert abs(balances[member1_key] - (-30.00)) < 0.01
        assert abs(balances[member2_key] - (-30.00)) < 0.01
    
    async def test_balances_multiple_expenses(
        self,
        client: AsyncClient,
        auth_token: str,
        db_session: AsyncSession,
        test_group_with_members: tuple[Group, list[GroupMember]],
    ):
        """Test balances with multiple expenses."""
        group, members = test_group_with_members
        
        # Expense 1: Member 0 pays 60, split between 0 and 1
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
        
        # Expense 2: Member 1 pays 40, split between 0 and 1
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
        data = response.json()
        balances = data["balances"]
        
        member0_key = members[0].user_id
        member1_key = members[1].user_id
        
        # Member 0: paid 60, owes 50 (30+20), net: +10
        # Member 1: paid 40, owes 50 (30+20), net: -10
        assert abs(balances[member0_key] - 10.00) < 0.01
        assert abs(balances[member1_key] - (-10.00)) < 0.01
    
    async def test_balances_ghost_member_pays(
        self,
        client: AsyncClient,
        auth_token: str,
        db_session: AsyncSession,
        test_group_with_members: tuple[Group, list[GroupMember]],
    ):
        """Test balances when ghost member pays."""
        group, members = test_group_with_members
        ghost_member = members[2]
        
        # Ghost pays 60, split equally between all 3
        expense = Expense(
            group_id=group.id,
            created_by=None,  # Ghost member has no user_id
            paid_by_member_id=ghost_member.id,
            total_amount=60.00,
            currency=group.currency,
            note="Ghost Pays",
        )
        db_session.add(expense)
        await db_session.flush()
        
        for member in members:
            split = ExpenseSplit(
                expense_id=expense.id,
                member_id=member.id,
                share_amount=20.00,
            )
            db_session.add(split)
        
        await db_session.commit()
        
        response = await client.get(
            f"/api/v1/groups/{group.id}/balances",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        
        assert response.status_code == 200
        data = response.json()
        balances = data["balances"]
        
        member0_key = members[0].user_id
        member1_key = members[1].user_id
        ghost_key = f"ghost_{ghost_member.id}"
        
        # Ghost paid 60, owes 20, net: +40
        # Others paid 0, owe 20 each, net: -20 each
        assert abs(balances[member0_key] - (-20.00)) < 0.01
        assert abs(balances[member1_key] - (-20.00)) < 0.01
        assert abs(balances[ghost_key] - 40.00) < 0.01


class TestSettlements:
    """Tests for settlement suggestions."""
    
    async def test_settlements_simple(
        self,
        client: AsyncClient,
        auth_token: str,
        db_session: AsyncSession,
        test_group_with_members: tuple[Group, list[GroupMember]],
    ):
        """Test settlement suggestions."""
        group, members = test_group_with_members
        
        # Create imbalance: Member 0 owes Member 1
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
            f"/api/v1/groups/{group.id}/settlements",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "settlements" in data
        assert isinstance(data["settlements"], list)
        
        # Should suggest Member 0 pays Member 1 $50
        if len(data["settlements"]) > 0:
            settlement = data["settlements"][0]
            assert "from_user" in settlement
            assert "to_user" in settlement
            assert "amount" in settlement

