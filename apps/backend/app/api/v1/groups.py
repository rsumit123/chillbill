from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.deps import get_current_user, get_db
from app.db.models.group import Group, GroupMember


class GroupCreate(BaseModel):
    name: str
    currency: str = "INR"


router = APIRouter()


@router.get("/", response_model=list[dict])
async def list_groups(current_user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    stmt = (
        select(Group)
        .join(GroupMember, GroupMember.group_id == Group.id)
        .where(GroupMember.user_id == current_user.id)
        .order_by(Group.created_at.desc())
    )
    res = await db.execute(stmt)
    groups = res.scalars().all()
    return [{"id": g.id, "name": g.name, "currency": g.currency} for g in groups]


@router.post("/", response_model=dict)
async def create_group(payload: GroupCreate, current_user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    group = Group(name=payload.name, currency=payload.currency, created_by=current_user.id)
    db.add(group)
    await db.flush()
    member = GroupMember(group_id=group.id, user_id=current_user.id, is_admin=True)
    db.add(member)
    await db.commit()
    await db.refresh(group)
    return {"id": group.id, "name": group.name, "currency": group.currency}


@router.get("/{group_id}", response_model=dict)
async def get_group(group_id: str, current_user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    group = await db.get(Group, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    members_res = await db.execute(select(GroupMember).where(GroupMember.group_id == group_id))
    members = [
        {"user_id": m.user_id, "is_admin": m.is_admin, "joined_at": m.joined_at.isoformat()}
        for m in members_res.scalars().all()
    ]
    return {"id": group.id, "name": group.name, "currency": group.currency, "members": members}
