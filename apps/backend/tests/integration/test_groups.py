"""
Integration tests for groups endpoints.
"""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.user import User
from app.db.models.group import Group, GroupMember


class TestGroupsList:
    """Tests for listing groups."""
    
    async def test_list_groups_success(
        self, client: AsyncClient, auth_token: str, test_group: Group
    ):
        """Test listing user's groups."""
        response = await client.get(
            "/api/v1/groups/",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 1
        assert any(g["id"] == test_group.id for g in data)
    
    async def test_list_groups_unauthorized(self, client: AsyncClient):
        """Test listing groups without auth."""
        response = await client.get("/api/v1/groups/")
        
        assert response.status_code == 401


class TestGroupsCreate:
    """Tests for creating groups."""
    
    async def test_create_group_success(self, client: AsyncClient, auth_token: str):
        """Test successful group creation."""
        response = await client.post(
            "/api/v1/groups/",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "name": "New Test Group",
                "currency": "EUR",
                "icon": "trip",
            },
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "New Test Group"
        assert data["currency"] == "EUR"
        assert data["icon"] == "trip"
        assert "id" in data
    
    async def test_create_group_minimal(self, client: AsyncClient, auth_token: str):
        """Test creating group with minimal data."""
        response = await client.post(
            "/api/v1/groups/",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "name": "Minimal Group",
                "currency": "USD",
            },
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Minimal Group"
        assert data["icon"] == "group"  # Default icon
    
    async def test_create_group_unauthorized(self, client: AsyncClient):
        """Test creating group without auth."""
        response = await client.post(
            "/api/v1/groups/",
            json={"name": "Test", "currency": "USD"},
        )
        
        assert response.status_code == 401


class TestGroupsGet:
    """Tests for getting group details."""
    
    async def test_get_group_success(
        self, client: AsyncClient, auth_token: str, test_group: Group
    ):
        """Test getting group details."""
        response = await client.get(
            f"/api/v1/groups/{test_group.id}",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == test_group.id
        assert data["name"] == test_group.name
        assert "members" in data
        assert isinstance(data["members"], list)
    
    async def test_get_group_not_member(
        self, client: AsyncClient, auth_token2: str, test_group: Group
    ):
        """Test getting group when not a member."""
        response = await client.get(
            f"/api/v1/groups/{test_group.id}",
            headers={"Authorization": f"Bearer {auth_token2}"},
        )
        
        assert response.status_code == 403
    
    async def test_get_group_not_found(self, client: AsyncClient, auth_token: str):
        """Test getting non-existent group."""
        response = await client.get(
            "/api/v1/groups/nonexistent-id",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        
        assert response.status_code == 404


class TestGroupsDelete:
    """Tests for deleting groups."""
    
    async def test_delete_group_success(
        self, client: AsyncClient, auth_token: str, db_session: AsyncSession, test_user: User
    ):
        """Test successful group deletion."""
        # Create a group to delete
        group = Group(name="To Delete", currency="USD")
        db_session.add(group)
        await db_session.flush()
        
        member = GroupMember(group_id=group.id, user_id=test_user.id, is_ghost=False)
        db_session.add(member)
        await db_session.commit()
        await db_session.refresh(group)
        
        response = await client.delete(
            f"/api/v1/groups/{group.id}",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        
        assert response.status_code == 204
    
    async def test_delete_group_not_member(
        self, client: AsyncClient, auth_token2: str, test_group: Group
    ):
        """Test deleting group when not a member."""
        response = await client.delete(
            f"/api/v1/groups/{test_group.id}",
            headers={"Authorization": f"Bearer {auth_token2}"},
        )
        
        assert response.status_code == 403


class TestGroupsAddMember:
    """Tests for adding members to groups."""
    
    async def test_add_member_by_email(
        self, client: AsyncClient, auth_token: str, test_group: Group, test_user2: User
    ):
        """Test adding a registered user by email."""
        response = await client.post(
            f"/api/v1/groups/{test_group.id}/members",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"email": test_user2.email},
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["user_id"] == test_user2.id
        assert data["is_ghost"] == False
    
    async def test_add_member_by_name_ghost(
        self, client: AsyncClient, auth_token: str, test_group: Group
    ):
        """Test adding a ghost member by name."""
        response = await client.post(
            f"/api/v1/groups/{test_group.id}/members",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"name": "Ghost User"},
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["ghost_name"] == "Ghost User"
        assert data["is_ghost"] == True
        assert data["user_id"] is None
    
    async def test_add_member_duplicate(
        self, client: AsyncClient, auth_token: str, test_group: Group, test_user: User
    ):
        """Test adding a member who's already in the group."""
        response = await client.post(
            f"/api/v1/groups/{test_group.id}/members",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"email": test_user.email},
        )
        
        assert response.status_code == 400
        assert "already a member" in response.json()["detail"].lower()


class TestGroupsRemoveMember:
    """Tests for removing members from groups."""
    
    async def test_remove_member_success(
        self,
        client: AsyncClient,
        auth_token: str,
        test_group_with_members: tuple[Group, list[GroupMember]],
    ):
        """Test successful member removal."""
        group, members = test_group_with_members
        member_to_remove = members[1]  # Second member
        
        response = await client.delete(
            f"/api/v1/groups/{group.id}/members/{member_to_remove.id}",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        
        assert response.status_code == 204
    
    async def test_remove_member_not_found(
        self, client: AsyncClient, auth_token: str, test_group: Group
    ):
        """Test removing non-existent member."""
        response = await client.delete(
            f"/api/v1/groups/{test_group.id}/members/99999",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        
        assert response.status_code == 404

