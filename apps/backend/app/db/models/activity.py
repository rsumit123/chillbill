from datetime import datetime
import uuid
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, DateTime, ForeignKey, JSON, Enum

from app.db.session import Base


class Activity(Base):
    __tablename__ = "activity"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    group_id: Mapped[str] = mapped_column(String(36), ForeignKey("groups.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="SET NULL"))
    type: Mapped[str] = mapped_column(
        Enum(
            "expense_created",
            "expense_updated",
            "settlement_created",
            "member_added",
            name="activity_type",
        ),
        nullable=False,
    )
    payload: Mapped[dict] = mapped_column(JSON, nullable=False, default={})
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
