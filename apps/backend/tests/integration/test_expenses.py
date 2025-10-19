"""
Integration tests for expenses endpoints.
"""
import pytest
from datetime import datetime
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.user import User
from app.db.models.group import Group, GroupMember
from app.db.models.expense import Expense, ExpenseSplit


class TestExpensesList:
    """Tests for listing expenses."""
    
    async def test_list_expenses_success(
        self,
        client: AsyncClient,
        auth_token: str,
        test_group_with_members: tuple[Group, list[GroupMember]],
    ):
        """Test listing group expenses."""
        group, members = test_group_with_members
        
        response = await client.get(
            f"/api/v1/groups/{group.id}/expenses",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    async def test_list_expenses_not_member(
        self, client: AsyncClient, auth_token2: str, test_group: Group
    ):
        """Test listing expenses when not a member."""
        response = await client.get(
            f"/api/v1/groups/{test_group.id}/expenses",
            headers={"Authorization": f"Bearer {auth_token2}"},
        )
        
        assert response.status_code == 403


class TestExpensesCreate:
    """Tests for creating expenses."""
    
    async def test_create_expense_success(
        self,
        client: AsyncClient,
        auth_token: str,
        test_group_with_members: tuple[Group, list[GroupMember]],
    ):
        """Test successful expense creation."""
        group, members = test_group_with_members
        
        response = await client.post(
            f"/api/v1/groups/{group.id}/expenses",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "total_amount": 100.00,
                "currency": group.currency,
                "note": "Test Expense",
                "date": datetime.utcnow().isoformat(),
                "paid_by_member_id": members[0].id,
                "splits": [
                    {"member_id": members[0].id, "share_amount": 50.00},
                    {"member_id": members[1].id, "share_amount": 50.00},
                ],
            },
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
    
    async def test_create_expense_with_subset_members(
        self,
        client: AsyncClient,
        auth_token: str,
        test_group_with_members: tuple[Group, list[GroupMember]],
    ):
        """Test creating expense split among subset of members."""
        group, members = test_group_with_members
        
        # Only split between first two members, not all three
        response = await client.post(
            f"/api/v1/groups/{group.id}/expenses",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "total_amount": 60.00,
                "currency": group.currency,
                "note": "Subset Expense",
                "paid_by_member_id": members[0].id,
                "splits": [
                    {"member_id": members[0].id, "share_amount": 30.00},
                    {"member_id": members[1].id, "share_amount": 30.00},
                ],
            },
        )
        
        assert response.status_code == 200
        
        # Verify the expense list shows correct participants
        list_response = await client.get(
            f"/api/v1/groups/{group.id}/expenses",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        expenses = list_response.json()
        
        # Find our expense
        expense = next((e for e in expenses if e["note"] == "Subset Expense"), None)
        assert expense is not None
        assert len(expense["participant_member_ids"]) == 2
        assert members[0].id in expense["participant_member_ids"]
        assert members[1].id in expense["participant_member_ids"]
        assert members[2].id not in expense["participant_member_ids"]
    
    async def test_create_expense_with_ghost_payer(
        self,
        client: AsyncClient,
        auth_token: str,
        test_group_with_members: tuple[Group, list[GroupMember]],
    ):
        """Test creating expense paid by ghost member."""
        group, members = test_group_with_members
        ghost_member = members[2]  # Third member is ghost
        
        response = await client.post(
            f"/api/v1/groups/{group.id}/expenses",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "total_amount": 80.00,
                "currency": group.currency,
                "note": "Ghost Paid Expense",
                "paid_by_member_id": ghost_member.id,
                "splits": [
                    {"member_id": members[0].id, "share_amount": 40.00},
                    {"member_id": ghost_member.id, "share_amount": 40.00},
                ],
            },
        )
        
        assert response.status_code == 200
    
    async def test_create_expense_zero_amount(
        self,
        client: AsyncClient,
        auth_token: str,
        test_group_with_members: tuple[Group, list[GroupMember]],
    ):
        """Test creating expense with zero amount (should fail)."""
        group, members = test_group_with_members
        
        response = await client.post(
            f"/api/v1/groups/{group.id}/expenses",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "total_amount": 0.00,
                "currency": group.currency,
                "note": "Zero Expense",
                "paid_by_member_id": members[0].id,
                "splits": [
                    {"member_id": members[0].id, "share_amount": 0.00},
                ],
            },
        )
        
        assert response.status_code == 400
    
    async def test_create_expense_invalid_payer(
        self,
        client: AsyncClient,
        auth_token: str,
        test_group: Group,
    ):
        """Test creating expense with invalid payer member ID."""
        response = await client.post(
            f"/api/v1/groups/{test_group.id}/expenses",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "total_amount": 50.00,
                "currency": test_group.currency,
                "note": "Invalid Payer",
                "paid_by_member_id": 99999,  # Non-existent member
                "splits": [
                    {"member_id": 1, "share_amount": 50.00},
                ],
            },
        )
        
        assert response.status_code == 400


class TestExpensesGet:
    """Tests for getting expense details."""
    
    async def test_get_expense_success(
        self,
        client: AsyncClient,
        auth_token: str,
        db_session: AsyncSession,
        test_group_with_members: tuple[Group, list[GroupMember]],
    ):
        """Test getting expense details."""
        group, members = test_group_with_members
        
        # Create an expense
        expense = Expense(
            group_id=group.id,
            created_by=members[0].user_id,
            paid_by_member_id=members[0].id,
            total_amount=100.00,
            currency=group.currency,
            note="Test Expense",
        )
        db_session.add(expense)
        await db_session.flush()
        
        split1 = ExpenseSplit(
            expense_id=expense.id,
            member_id=members[0].id,
            share_amount=50.00,
        )
        split2 = ExpenseSplit(
            expense_id=expense.id,
            member_id=members[1].id,
            share_amount=50.00,
        )
        db_session.add_all([split1, split2])
        await db_session.commit()
        
        response = await client.get(
            f"/api/v1/groups/expenses/{expense.id}",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == expense.id
        assert data["total_amount"] == 100.00
        assert len(data["splits"]) == 2


class TestExpensesUpdate:
    """Tests for updating expenses."""
    
    async def test_update_expense_success(
        self,
        client: AsyncClient,
        auth_token: str,
        db_session: AsyncSession,
        test_group_with_members: tuple[Group, list[GroupMember]],
    ):
        """Test successful expense update."""
        group, members = test_group_with_members
        
        # Create an expense
        expense = Expense(
            group_id=group.id,
            created_by=members[0].user_id,
            paid_by_member_id=members[0].id,
            total_amount=100.00,
            currency=group.currency,
            note="Original Note",
        )
        db_session.add(expense)
        await db_session.flush()
        
        split = ExpenseSplit(
            expense_id=expense.id,
            member_id=members[0].id,
            share_amount=100.00,
        )
        db_session.add(split)
        await db_session.commit()
        await db_session.refresh(expense)
        
        # Update the expense
        response = await client.put(
            f"/api/v1/groups/expenses/{expense.id}",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "total_amount": 150.00,
                "currency": group.currency,
                "note": "Updated Note",
                "paid_by_member_id": members[0].id,
                "splits": [
                    {"member_id": members[0].id, "share_amount": 150.00},
                ],
            },
        )
        
        assert response.status_code == 200


class TestExpensesDelete:
    """Tests for deleting expenses."""
    
    async def test_delete_expense_success(
        self,
        client: AsyncClient,
        auth_token: str,
        db_session: AsyncSession,
        test_group_with_members: tuple[Group, list[GroupMember]],
    ):
        """Test successful expense deletion."""
        group, members = test_group_with_members
        
        # Create an expense
        expense = Expense(
            group_id=group.id,
            created_by=members[0].user_id,
            paid_by_member_id=members[0].id,
            total_amount=100.00,
            currency=group.currency,
            note="To Delete",
        )
        db_session.add(expense)
        await db_session.commit()
        await db_session.refresh(expense)
        
        response = await client.delete(
            f"/api/v1/groups/expenses/{expense.id}",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        
        assert response.status_code == 204
    
    async def test_delete_expense_not_found(
        self, client: AsyncClient, auth_token: str
    ):
        """Test deleting non-existent expense."""
        response = await client.delete(
            "/api/v1/groups/expenses/nonexistent-id",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        
        assert response.status_code == 404

