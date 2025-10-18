from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.deps import get_current_user, get_db
from app.db.models.activity import Activity

router = APIRouter()


@router.get("/{group_id}/activity", response_model=list[dict])
async def list_activity(group_id: str, current_user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Activity).where(Activity.group_id == group_id).order_by(Activity.created_at.desc()).limit(100))
    items = res.scalars().all()
    return [
        {
            "id": a.id,
            "type": a.type,
            "payload": a.payload,
            "created_at": a.created_at.isoformat(),
        }
        for a in items
    ]
