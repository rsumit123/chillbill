"""
Pytest configuration and shared fixtures for backend tests.
"""
import asyncio
import os
import pytest
import pytest_asyncio
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


# Test database URL (file-based for proper async support)
import tempfile
import os

# Create a unique temp file for each test run
TEST_DB_FILE = tempfile.mktemp(suffix=".db")
TEST_DATABASE_URL = f"sqlite+aiosqlite:///{TEST_DB_FILE}"


@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the test session."""
    policy = asyncio.get_event_loop_policy()
    loop = policy.new_event_loop()
    yield loop
    loop.close()
    # Cleanup temp database file
    if os.path.exists(TEST_DB_FILE):
        os.remove(TEST_DB_FILE)


@pytest_asyncio.fixture(scope="function")
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    """Create a test database session with fresh schema for each test."""
    # Import all models to ensure they're registered with Base.metadata
    _ = (User, Group, GroupMember, Expense, ExpenseSplit, Activity, Settlement)
    
    # Create engine for this test
    engine = create_async_engine(
        TEST_DATABASE_URL,
        connect_args={"check_same_thread": False},
        poolclass=NullPool,
        echo=False,
    )
    
    # Create all tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    # Create session
    async_session = async_sessionmaker(
        engine, 
        class_=AsyncSession, 
        expire_on_commit=False,
    )
    
    async with async_session() as session:
        yield session
    
    # Cleanup
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    
    await engine.dispose()


@pytest_asyncio.fixture(scope="function")
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """Create a test HTTP client with database session override."""
    async def override_get_db():
        yield db_session
    
    app.dependency_overrides[get_db] = override_get_db
    
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    
    app.dependency_overrides.clear()


@pytest_asyncio.fixture(scope="function")
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


@pytest_asyncio.fixture(scope="function")
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


@pytest_asyncio.fixture(scope="function")
async def auth_token(client: AsyncClient, test_user: User) -> str:
    """Get authentication token for test user."""
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": test_user.email, "password": "password123"},
    )
    assert response.status_code == 200
    data = response.json()
    # API now returns {tokens: {access_token, refresh_token, token_type}, user: {...}}
    return data["tokens"]["access_token"]


@pytest_asyncio.fixture(scope="function")
async def auth_token2(client: AsyncClient, test_user2: User) -> str:
    """Get authentication token for second test user."""
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": test_user2.email, "password": "password123"},
    )
    assert response.status_code == 200
    data = response.json()
    # API now returns {tokens: {access_token, refresh_token, token_type}, user: {...}}
    return data["tokens"]["access_token"]


@pytest_asyncio.fixture(scope="function")
async def test_group(db_session: AsyncSession, test_user: User) -> Group:
    """Create a test group."""
    group = Group(
        id="test-group-id",
        name="Test Group",
        currency="USD",
        icon="group",
        created_by=test_user.id,  # Add created_by field
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


@pytest_asyncio.fixture(scope="function")
async def test_group_with_members(
    db_session: AsyncSession, test_user: User, test_user2: User
) -> tuple[Group, list[GroupMember]]:
    """Create a test group with multiple members."""
    group = Group(
        id="test-group-members-id",
        name="Test Group with Members",
        currency="INR",
        icon="trip",
        created_by=test_user.id,  # Add created_by field
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
        name="Ghost Member",  # Field is 'name', not 'ghost_name'
        is_ghost=True,
    )
    
    db_session.add_all([member1, member2, member3])
    await db_session.commit()
    
    await db_session.refresh(group)
    await db_session.refresh(member1)
    await db_session.refresh(member2)
    await db_session.refresh(member3)
    
    return group, [member1, member2, member3]

