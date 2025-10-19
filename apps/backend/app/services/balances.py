from collections import defaultdict
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.models.expense import Expense, ExpenseSplit
from app.db.models.group import GroupMember


async def compute_group_balances(db: AsyncSession, group_id: str) -> dict[str, float]:
    """
    Compute balances for all members in a group.
    Returns dict mapping user_id -> balance (positive = owed, negative = owes)
    For ghost members, we use a placeholder key like "ghost_<member_id>"
    """
    balances: dict[str, float] = defaultdict(float)
    res = await db.execute(select(Expense).where(Expense.group_id == group_id, Expense.deleted_at.is_(None)))
    expenses = res.scalars().all()

    for e in expenses:
        # The payer gets credit for the full amount
        # Use paid_by_member_id to find the payer (works for both registered and ghost members)
        payer_member = await db.get(GroupMember, e.paid_by_member_id)
        if payer_member:
            # Use user_id if available (registered user), otherwise use ghost key
            payer_key = payer_member.user_id if payer_member.user_id else f"ghost_{payer_member.id}"
            balances[payer_key] += float(e.total_amount)
        
        # Each split reduces the member's balance
        splits_res = await db.execute(select(ExpenseSplit).where(ExpenseSplit.expense_id == e.id))
        splits = splits_res.scalars().all()
        for s in splits:
            # Get the member to find their user_id
            member = await db.get(GroupMember, s.member_id)
            if member:
                # Use user_id if available, otherwise use a ghost key
                key = member.user_id if member.user_id else f"ghost_{member.id}"
                balances[key] -= float(s.share_amount)
    
    return dict(balances)
