"""Aggregate per-person balances across all groups the current user is in.

Returns a list of registered users (excluding ghosts and the current user)
who have a non-zero balance with the current user in at least one group/currency.
"""
from collections import defaultdict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.group import Group, GroupMember
from app.db.models.user import User
from app.services.balances import compute_group_balances


_TOLERANCE = 0.01


async def compute_people_balances(db: AsyncSession, current_user_id: str) -> list[dict]:
    """Return people aggregated across the current user's groups.

    See spec §4.1 for the response shape. Sign convention: `+` means the
    other person owes the current user; `-` means the current user owes them.
    """
    # 1. Find all groups the current user is in (only those where the user is a registered member).
    res = await db.execute(
        select(GroupMember.group_id).where(GroupMember.user_id == current_user_id)
    )
    group_ids = [row[0] for row in res.all()]
    if not group_ids:
        return []

    # 2. Pre-fetch all groups (for name + currency).
    res = await db.execute(select(Group).where(Group.id.in_(group_ids)))
    groups_by_id = {g.id: g for g in res.scalars().all()}

    # 3. Pre-fetch all members across these groups.
    res = await db.execute(
        select(GroupMember).where(GroupMember.group_id.in_(group_ids))
    )
    members_by_group: dict[str, list[GroupMember]] = defaultdict(list)
    for m in res.scalars().all():
        members_by_group[m.group_id].append(m)

    # 4. For each group, compute balances and collect contributions per other registered user.
    contributions: dict[str, list[tuple]] = defaultdict(list)
    for gid in group_ids:
        group = groups_by_id.get(gid)
        if group is None:
            continue
        balances = await compute_group_balances(db, gid)  # {member_id: float, positive = owed by group}
        for member in members_by_group.get(gid, []):
            if member.user_id is None:                  # ghost
                continue
            if member.user_id == current_user_id:       # yourself
                continue
            other_balance = float(balances.get(member.id, 0.0))
            # Other member's balance is positive when they are owed by the group;
            # from our point of view they are owed by US, so we owe them — flip sign.
            from_my_pov = -other_balance
            if abs(from_my_pov) < _TOLERANCE:
                continue
            contributions[member.user_id].append(
                (gid, group.name, group.currency, from_my_pov)
            )

    if not contributions:
        return []

    # 5. Load User rows for display info.
    res = await db.execute(select(User).where(User.id.in_(contributions.keys())))
    users_by_id = {u.id: u for u in res.scalars().all()}

    # 6. Build people output; drop currencies that cancel; skip people whose currencies all net to 0.
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

    # 7. Sort by sum of absolute totals descending.
    people.sort(key=lambda p: sum(abs(v) for v in p["balances"].values()), reverse=True)
    return people
