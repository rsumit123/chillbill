from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.deps import get_current_user, get_db
from app.db.models.group import Group, GroupMember
from app.db.models.user import User
from app.db.crud.user import get_user_by_email


class GroupCreate(BaseModel):
    name: str
    currency: str = "INR"
    icon: str | None = None


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
    group = Group(name=payload.name, currency=payload.currency, icon=payload.icon, created_by=current_user.id)
    db.add(group)
    await db.flush()
    member = GroupMember(group_id=group.id, user_id=current_user.id, is_admin=True)
    db.add(member)
    await db.commit()
    await db.refresh(group)
    return {"id": group.id, "name": group.name, "currency": group.currency, "icon": group.icon}


@router.get("/{group_id}", response_model=dict)
async def get_group(group_id: str, current_user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    group = await db.get(Group, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    members_res = await db.execute(
        select(GroupMember, User)
        .join(User, User.id == GroupMember.user_id, isouter=True)
        .where(GroupMember.group_id == group_id)
    )
    rows = members_res.all()
    members = [
        {
            "member_id": gm.id,
            "user_id": gm.user_id,
            "is_admin": gm.is_admin,
            "joined_at": gm.joined_at.isoformat(),
            "name": (u.name if u is not None else gm.name),
            "email": (u.email if u is not None else None),
            "avatar_url": (u.avatar_url if u is not None else None),
            "is_ghost": gm.is_ghost,
        }
        for gm, u in rows
    ]
    return {"id": group.id, "name": group.name, "currency": group.currency, "icon": group.icon, "members": members}


@router.delete("/{group_id}", status_code=204)
async def delete_group(group_id: str, current_user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    group = await db.get(Group, group_id)
    if not group:
        return None
    # allow creator or admin member
    is_creator = group.created_by == current_user.id
    admin_res = await db.execute(select(GroupMember).where(GroupMember.group_id == group_id, GroupMember.user_id == current_user.id, GroupMember.is_admin == True))
    is_admin = admin_res.scalars().first() is not None
    if not (is_creator or is_admin):
        raise HTTPException(status_code=403, detail="Not allowed to delete group")
    # hard-delete; FKs cascade
    await db.delete(group)
    await db.commit()
    return None


@router.delete("/{group_id}/members/{member_id}", status_code=204)
async def delete_member(
    group_id: str,
    member_id: int,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    group = await db.get(Group, group_id)
    if not group:
        return None
    gm = await db.get(GroupMember, member_id)
    if not gm or gm.group_id != group_id:
        return None
    # allow creator or admin member to remove
    is_creator = group.created_by == current_user.id
    admin_res = await db.execute(
        select(GroupMember).where(
            GroupMember.group_id == group_id,
            GroupMember.user_id == current_user.id,
            GroupMember.is_admin == True,
        )
    )
    is_admin = admin_res.scalars().first() is not None
    if not (is_creator or is_admin or gm.user_id == current_user.id):
        raise HTTPException(status_code=403, detail="Not allowed to remove member")
    await db.delete(gm)
    await db.commit()
    return None


class AddMemberRequest(BaseModel):
    email: EmailStr | None = None
    name: str | None = None
    is_admin: bool | None = None


@router.post("/{group_id}/members", response_model=dict, status_code=status.HTTP_201_CREATED)
async def add_member(
    group_id: str,
    payload: AddMemberRequest,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    group = await db.get(Group, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    # Only existing members can add others (MVP)
    me_res = await db.execute(
        select(GroupMember).where(GroupMember.group_id == group_id, GroupMember.user_id == current_user.id)
    )
    if not me_res.scalars().first():
        raise HTTPException(status_code=403, detail="Not a group member")

    if payload.email:
        user = await get_user_by_email(db, payload.email)
        if not user:
            # create ghost member with provided name fallback from email
            gm = GroupMember(group_id=group_id, user_id=None, is_admin=bool(payload.is_admin), name=payload.name or payload.email.split('@')[0], is_ghost=True)
            db.add(gm)
            await db.commit()
            await db.refresh(gm)
            return {"user_id": None, "is_admin": gm.is_admin, "joined_at": gm.joined_at.isoformat(), "name": gm.name, "email": payload.email, "avatar_url": None, "is_ghost": True}
        # real user
        gm_existing = await db.execute(
            select(GroupMember).where(GroupMember.group_id == group_id, GroupMember.user_id == user.id)
        )
        if gm_existing.scalars().first():
            raise HTTPException(status_code=400, detail="Already a member")
        gm = GroupMember(group_id=group_id, user_id=user.id, is_admin=bool(payload.is_admin), name=user.name, is_ghost=False)
        db.add(gm)
        await db.commit()
        await db.refresh(gm)
        return {"user_id": gm.user_id, "is_admin": gm.is_admin, "joined_at": gm.joined_at.isoformat(), "name": user.name, "email": user.email, "avatar_url": user.avatar_url, "is_ghost": False}

    # No email provided: create pure ghost with name
    if not payload.name:
        raise HTTPException(status_code=400, detail="Name required for ghost member")
    gm = GroupMember(group_id=group_id, user_id=None, is_admin=bool(payload.is_admin), name=payload.name, is_ghost=True)
    db.add(gm)
    await db.commit()
    await db.refresh(gm)
    return {"user_id": None, "is_admin": gm.is_admin, "joined_at": gm.joined_at.isoformat(), "name": gm.name, "email": None, "avatar_url": None, "is_ghost": True}
