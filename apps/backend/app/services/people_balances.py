"""Aggregate per-person balances across all groups the current user is in.

Pairwise debts are derived from `settlement_suggestions(...)` for each group,
NOT from each member's group-level balance directly. Group balances only tell
you how each member stands vs. the group collectively — they do not encode
who-owes-whom. The settlement suggestions output the minimum-transaction
pairwise transfers, which is the right primitive for per-person aggregation.
"""
from collections import defaultdict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.group import Group, GroupMember
from app.db.models.user import User
from app.services.balances import compute_group_balances
from app.services.settlements import settlement_suggestions


_TOLERANCE = 0.01


async def compute_people_balances(db: AsyncSession, current_user_id: str) -> list[dict]:
    """Return people aggregated across the current user's groups.

    Sign convention in the output: `+` means the other person owes the current
    user; `-` means the current user owes them.
    """
    # 1. Find all groups the current user is in.
    res = await db.execute(
        select(GroupMember.group_id).where(GroupMember.user_id == current_user_id)
    )
    group_ids = [row[0] for row in res.all()]
    if not group_ids:
        return []

    # 2. Pre-fetch groups (for name + currency).
    res = await db.execute(select(Group).where(Group.id.in_(group_ids)))
    groups_by_id = {g.id: g for g in res.scalars().all()}

    # 3. Pre-fetch all members; build lookup maps.
    res = await db.execute(
        select(GroupMember).where(GroupMember.group_id.in_(group_ids))
    )
    members_by_group: dict[str, list[GroupMember]] = defaultdict(list)
    member_by_id: dict[int, GroupMember] = {}
    for m in res.scalars().all():
        members_by_group[m.group_id].append(m)
        member_by_id[m.id] = m

    # 4. For each group: get its settlement suggestions and filter to those involving the current user.
    contributions: dict[str, list[tuple]] = defaultdict(list)
    for gid in group_ids:
        group = groups_by_id.get(gid)
        if group is None:
            continue
        # Find the current user's member_id within this group.
        my_member_id = None
        for m in members_by_group.get(gid, []):
            if m.user_id == current_user_id:
                my_member_id = m.id
                break
        if my_member_id is None:
            continue
        balances = await compute_group_balances(db, gid)
        for t in settlement_suggestions(balances):
            from_mid = t["from_member_id"]
            to_mid = t["to_member_id"]
            amount = float(t["amount"])
            if my_member_id == from_mid:
                # I pay them → I owe them → negative from my POV.
                other = member_by_id.get(to_mid)
                signed = -amount
            elif my_member_id == to_mid:
                # They pay me → they owe me → positive from my POV.
                other = member_by_id.get(from_mid)
                signed = +amount
            else:
                # Transfer doesn't involve me — skip.
                continue
            if other is None or other.user_id is None:
                # Counterparty is a ghost — excluded by spec.
                continue
            if abs(signed) < _TOLERANCE:
                continue
            contributions[other.user_id].append((gid, group.name, group.currency, signed))

    if not contributions:
        return []

    # 5. Load User rows for display info.
    res = await db.execute(select(User).where(User.id.in_(contributions.keys())))
    users_by_id = {u.id: u for u in res.scalars().all()}

    # 6. Build output: net per currency, drop currencies that net to zero, drop people with no remaining balance.
    people: list[dict] = []
    for uid, contribs in contributions.items():
        user = users_by_id.get(uid)
        if user is None:
            continue
        per_currency: dict[str, float] = defaultdict(float)
        for _gid, _gname, currency, amount in contribs:
            per_currency[currency] += amount
        balances_out = {c: round(amt, 2) for c, amt in per_currency.items() if abs(amt) >= _TOLERANCE}
        if not balances_out:
            continue
        people.append({
            "user_id": user.id,
            "name": user.name,
            "avatar_url": user.avatar_url,
            "balances": balances_out,
            "groups": [
                {
                    "group_id": gid,
                    "group_name": gname,
                    "currency": currency,
                    "balance": round(amount, 2),
                }
                for (gid, gname, currency, amount) in contribs
            ],
        })

    # 7. Sort by total absolute balance descending.
    people.sort(key=lambda p: sum(abs(v) for v in p["balances"].values()), reverse=True)
    return people
