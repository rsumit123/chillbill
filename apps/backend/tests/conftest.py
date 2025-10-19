"""
Pytest configuration and shared fixtures for backend tests.
"""
import asyncio
import os
import pytest
from typing import AsyncGenerator
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.pool import NullPool

from app.main import app
from app.core.deps import get_db
from app.db.session import Base
from app.db.models.user import User
from app.db.models.group import Group, GroupMember
from app.db.models.expense import Expense, ExpenseSplit
from app.db.models.activity import Activity
from app.db.models.settlement import Settlement
from app.core.security import hash_password


# Test database URL (in-memory SQLite)
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
async def test_db_engine():
    """Create a test database engine."""
    # Import all models to ensure they're registered with Base.metadata
    # (already imported at top of file, but making explicit)
    _ = (User, Group, GroupMember, Expense, ExpenseSplit, Activity, Settlement)
    
    engine = create_async_engine(
        TEST_DATABASE_URL,
        connect_args={"check_same_thread": False},
        poolclass=NullPool,
    )
    
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    yield engine
    
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    
    await engine.dispose()


@pytest.fixture
async def db_session(test_db_engine) -> AsyncGenerator[AsyncSession, None]:
    """Create a test database session."""
    async_session = async_sessionmaker(
        test_db_engine, class_=AsyncSession, expire_on_commit=False
    )
    
    async with async_session() as session:
        yield session


@pytest.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """Create a test HTTP client with database session override."""
    async def override_get_db():
        yield db_session
    
    app.dependency_overrides[get_db] = override_get_db
    
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    
    app.dependency_overrides.clear()


@pytest.fixture
async def test_user(db_session: AsyncSession) -> User:
    """Create a test user."""
    user = User(
        id="test-user-id",
        email="test@example.com",
        name="Test User",
        password_hash=hash_password("password123"),
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest.fixture
async def test_user2(db_session: AsyncSession) -> User:
    """Create a second test user."""
    user = User(
        id="test-user-id-2",
        email="test2@example.com",
        name="Test User 2",
        password_hash=hash_password("password123"),
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest.fixture
async def auth_token(client: AsyncClient, test_user: User) -> str:
    """Get authentication token for test user."""
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": test_user.email, "password": "password123"},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


@pytest.fixture
async def auth_token2(client: AsyncClient, test_user2: User) -> str:
    """Get authentication token for second test user."""
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": test_user2.email, "password": "password123"},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


@pytest.fixture
async def test_group(db_session: AsyncSession, test_user: User) -> Group:
    """Create a test group."""
    group = Group(
        id="test-group-id",
        name="Test Group",
        currency="USD",
        icon="group",
    )
    db_session.add(group)
    await db_session.flush()
    
    # Add creator as member
    member = GroupMember(
        group_id=group.id,
        user_id=test_user.id,
        is_ghost=False,
    )
    db_session.add(member)
    await db_session.commit()
    await db_session.refresh(group)
    return group


@pytest.fixture
async def test_group_with_members(
    db_session: AsyncSession, test_user: User, test_user2: User
) -> tuple[Group, list[GroupMember]]:
    """Create a test group with multiple members."""
    group = Group(
        id="test-group-members-id",
        name="Test Group with Members",
        currency="INR",
        icon="trip",
    )
    db_session.add(group)
    await db_session.flush()
    
    # Add members
    member1 = GroupMember(
        group_id=group.id,
        user_id=test_user.id,
        is_ghost=False,
    )
    member2 = GroupMember(
        group_id=group.id,
        user_id=test_user2.id,
        is_ghost=False,
    )
    member3 = GroupMember(
        group_id=group.id,
        user_id=None,
        ghost_name="Ghost Member",
        is_ghost=True,
    )
    
    db_session.add_all([member1, member2, member3])
    await db_session.commit()
    
    await db_session.refresh(group)
    await db_session.refresh(member1)
    await db_session.refresh(member2)
    await db_session.refresh(member3)
    
    return group, [member1, member2, member3]

