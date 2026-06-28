"""Shared helpers across API v1 routers."""
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.group import Group, GroupMember


async def require_membership(db: AsyncSession, group_id: str, user_id: str) -> Group:
    """Fetch group and assert the user is a member. Raises 404 or 403."""
    group = await db.get(Group, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    res = await db.execute(
        select(GroupMember).where(GroupMember.group_id == group_id, GroupMember.user_id == user_id)
    )
    if not res.scalars().first():
        raise HTTPException(status_code=403, detail="Not a group member")
    return group
