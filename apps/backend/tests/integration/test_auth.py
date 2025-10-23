"""
Integration tests for authentication endpoints.
"""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.user import User


class TestAuthSignup:
    """Tests for user signup."""
    
    async def test_signup_success(self, client: AsyncClient):
        """Test successful user signup."""
        response = await client.post(
            "/api/v1/auth/signup",
            json={
                "email": "newuser@example.com",
                "name": "New User",
                "password": "securepassword123",
            },
        )
        
        assert response.status_code == 200
        data = response.json()
        # API returns {tokens: {...}, user: {...}}
        assert "tokens" in data
        assert "user" in data
        assert "access_token" in data["tokens"]
        assert "refresh_token" in data["tokens"]
        assert data["tokens"]["token_type"] == "bearer"
        assert data["user"]["email"] == "newuser@example.com"
    
    async def test_signup_duplicate_email(self, client: AsyncClient, test_user: User):
        """Test signup with duplicate email."""
        response = await client.post(
            "/api/v1/auth/signup",
            json={
                "email": test_user.email,
                "name": "Another User",
                "password": "password123",
            },
        )
        
        assert response.status_code == 400
        assert "already registered" in response.json()["detail"].lower()
    
    async def test_signup_invalid_email(self, client: AsyncClient):
        """Test signup with invalid email."""
        response = await client.post(
            "/api/v1/auth/signup",
            json={
                "email": "not-an-email",
                "name": "Test User",
                "password": "password123",
            },
        )
        
        assert response.status_code == 422  # Validation error


class TestAuthLogin:
    """Tests for user login."""
    
    async def test_login_success(self, client: AsyncClient, test_user: User):
        """Test successful login."""
        response = await client.post(
            "/api/v1/auth/login",
            json={
                "email": test_user.email,
                "password": "password123",
            },
        )
        
        assert response.status_code == 200
        data = response.json()
        # API returns {tokens: {...}, user: {...}}
        assert "tokens" in data
        assert "user" in data
        assert "access_token" in data["tokens"]
        assert "refresh_token" in data["tokens"]
        assert data["tokens"]["token_type"] == "bearer"
    
    async def test_login_wrong_password(self, client: AsyncClient, test_user: User):
        """Test login with wrong password."""
        response = await client.post(
            "/api/v1/auth/login",
            json={
                "email": test_user.email,
                "password": "wrongpassword",
            },
        )
        
        assert response.status_code == 401
        # API returns "Invalid credentials"
        detail = response.json()["detail"].lower()
        assert "invalid" in detail or "incorrect" in detail
    
    async def test_login_nonexistent_user(self, client: AsyncClient):
        """Test login with non-existent email."""
        response = await client.post(
            "/api/v1/auth/login",
            json={
                "email": "nonexistent@example.com",
                "password": "password123",
            },
        )
        
        assert response.status_code == 401


class TestAuthRefresh:
    """Tests for token refresh."""
    
    async def test_refresh_token_success(self, client: AsyncClient, test_user: User):
        """Test successful token refresh."""
        # First login to get refresh token
        login_response = await client.post(
            "/api/v1/auth/login",
            json={
                "email": test_user.email,
                "password": "password123",
            },
        )
        # API returns {tokens: {...}, user: {...}}
        refresh_token = login_response.json()["tokens"]["refresh_token"]
        
        # Refresh the token
        response = await client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": refresh_token},
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        # Refresh endpoint only returns access_token, not token_type
    
    async def test_refresh_token_invalid(self, client: AsyncClient):
        """Test refresh with invalid token."""
        response = await client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": "invalid-token"},
        )
        
        assert response.status_code == 401


class TestAuthMe:
    """Tests for getting current user info."""
    
    async def test_me_success(self, client: AsyncClient, auth_token: str, test_user: User):
        """Test getting current user info."""
        response = await client.get(
            "/api/v1/me",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == test_user.email
        assert data["name"] == test_user.name
        assert "id" in data
    
    async def test_me_unauthorized(self, client: AsyncClient):
        """Test getting user info without auth."""
        response = await client.get("/api/v1/me")
        
        assert response.status_code == 401
    
    async def test_me_invalid_token(self, client: AsyncClient):
        """Test getting user info with invalid token."""
        response = await client.get(
            "/api/v1/me",
            headers={"Authorization": "Bearer invalid-token"},
        )
        
        assert response.status_code == 401

