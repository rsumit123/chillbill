import asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_async_session
from app.db.models.user import User
from app.db.models.group import Group, GroupMember
from app.db.models.expense import Expense, ExpenseSplit
from app.core.security import hash_password


async def seed(session: AsyncSession):
    # users
    alice = User(email="alice@example.com", name="Alice", password_hash=hash_password("password"))
    bob = User(email="bob@example.com", name="Bob", password_hash=hash_password("password"))
    charlie = User(email="charlie@example.com", name="Charlie", password_hash=hash_password("password"))
    session.add_all([alice, bob, charlie])
    await session.flush()

    group = Group(name="Flatmates", currency="INR", created_by=alice.id)
    session.add(group)
    await session.flush()

    session.add_all(
        [
            GroupMember(group_id=group.id, user_id=alice.id, is_admin=True),
            GroupMember(group_id=group.id, user_id=bob.id, is_admin=False),
            GroupMember(group_id=group.id, user_id=charlie.id, is_admin=False),
        ]
    )

    # expenses
    e1 = Expense(group_id=group.id, created_by=alice.id, total_amount=1500, currency="INR", note="Groceries")
    session.add(e1)
    await session.flush()
    session.add_all(
        [
            ExpenseSplit(expense_id=e1.id, user_id=alice.id, share_amount=500),
            ExpenseSplit(expense_id=e1.id, user_id=bob.id, share_amount=500),
            ExpenseSplit(expense_id=e1.id, user_id=charlie.id, share_amount=500),
        ]
    )

    await session.commit()
    print("Seeded demo data. Group: Flatmates")


async def main():
    async with get_async_session() as session:
        await seed(session)


if __name__ == "__main__":
    asyncio.run(main())
