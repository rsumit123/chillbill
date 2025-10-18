from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.models.user import User


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    res = await db.execute(select(User).where(User.email == email))
    return res.scalars().first()


async def get_user_by_id(db: AsyncSession, user_id: str) -> User | None:
    return await db.get(User, user_id)


async def create_user(db: AsyncSession, email: str, name: str, password_hash: str) -> User:
    user = User(email=email, name=name, password_hash=password_hash)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user
