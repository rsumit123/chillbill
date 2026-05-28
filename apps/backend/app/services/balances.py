from collections import defaultdict
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.models.expense import Expense, ExpenseSplit
from app.db.models.settlement import Settlement


async def compute_group_balances(db: AsyncSession, group_id: str) -> dict[int, float]:
    """Net balance per group member.

    Returns ``{member_id: balance}`` where positive = the member is owed
    money, negative = the member owes money. Works uniformly for registered
    and ghost members (both have a ``group_members.id``).

    Settlements reduce balances: when ``from`` pays ``to`` an amount, the
    payer's debt shrinks (balance moves toward 0 from below) and the
    creditor's credit shrinks (balance moves toward 0 from above).
    """
    balances: dict[int, float] = defaultdict(float)

    # Expenses: payer is credited, each split debits the participant.
    res = await db.execute(
        select(Expense).where(Expense.group_id == group_id, Expense.deleted_at.is_(None))
    )
    expenses = res.scalars().all()
    for e in expenses:
        balances[e.paid_by_member_id] += float(e.total_amount)
        splits_res = await db.execute(
            select(ExpenseSplit).where(ExpenseSplit.expense_id == e.id)
        )
        for s in splits_res.scalars().all():
            balances[s.member_id] -= float(s.share_amount)

    # Settlements: money moved from `from_member` to `to_member`.
    res = await db.execute(
        select(Settlement).where(
            Settlement.group_id == group_id,
            Settlement.status == "success",
        )
    )
    for st in res.scalars().all():
        amt = float(st.amount)
        balances[st.from_member_id] += amt  # debtor paid → owes less
        balances[st.to_member_id] -= amt    # creditor received → owed less

    return dict(balances)
