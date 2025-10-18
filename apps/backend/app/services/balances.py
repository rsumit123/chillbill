from collections import defaultdict
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.models.expense import Expense, ExpenseSplit


async def compute_group_balances(db: AsyncSession, group_id: str) -> dict[str, float]:
    balances: dict[str, float] = defaultdict(float)
    res = await db.execute(select(Expense).where(Expense.group_id == group_id, Expense.deleted_at.is_(None)))
    expenses = res.scalars().all()

    for e in expenses:
        balances[e.created_by] += float(e.total_amount)
        splits_res = await db.execute(select(ExpenseSplit).where(ExpenseSplit.expense_id == e.id))
        splits = splits_res.scalars().all()
        for s in splits:
            balances[s.user_id] -= float(s.share_amount)
    return dict(balances)
