from datetime import datetime
import uuid
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, DateTime, ForeignKey, Numeric, Text, UniqueConstraint

from app.db.session import Base


class Expense(Base):
    __tablename__ = "expenses"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    group_id: Mapped[str] = mapped_column(String(36), ForeignKey("groups.id", ondelete="CASCADE"), nullable=False)
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="SET NULL"))
    total_amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    date: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    receipt_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)


class ExpenseSplit(Base):
    __tablename__ = "expense_splits"
    __table_args__ = (UniqueConstraint("expense_id", "user_id", name="uq_expense_user"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    expense_id: Mapped[str] = mapped_column(String(36), ForeignKey("expenses.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    share_amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    share_percentage: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
