"""Tests for cross-group People view aggregation."""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.group import Group, GroupMember
from app.db.models.user import User
from app.db.models.expense import Expense, ExpenseSplit


async def _add_user(db: AsyncSession, email: str, name: str) -> User:
    from app.db.crud.user import create_user
    return await create_user(db, email=email, name=name, password_hash=None, auth_provider="email")


async def _add_group(db: AsyncSession, name: str, owner: User, currency: str = "INR") -> Group:
    g = Group(name=name, currency=currency, created_by=owner.id)
    db.add(g)
    await db.flush()
    return g


async def _add_member(db: AsyncSession, group: Group, user: User | None, name: str | None = None, is_ghost: bool = False) -> GroupMember:
    m = GroupMember(group_id=group.id, user_id=(user.id if user else None), name=name, is_ghost=is_ghost)
    db.add(m)
    await db.flush()
    return m


async def _add_expense(db: AsyncSession, group: Group, payer: GroupMember, total: float, splits: list[tuple[GroupMember, float]]) -> Expense:
    e = Expense(
        group_id=group.id,
        created_by=payer.user_id,
        paid_by_member_id=payer.id,
        total_amount=total,
        currency=group.currency,
        note="Test",
    )
    db.add(e)
    await db.flush()
    for m, share in splits:
        db.add(ExpenseSplit(expense_id=e.id, member_id=m.id, share_amount=share))
    await db.commit()
    return e


class TestPeopleBalancesEmpty:
    async def test_empty_when_user_has_no_groups(
        self, client: AsyncClient, auth_token: str
    ):
        resp = await client.get(
            "/api/v1/me/balances/people",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 200
        assert resp.json() == {"people": []}


class TestPeopleBalancesSimple:
    async def test_owed_by_one_registered_user(
        self, client: AsyncClient, auth_token: str, db_session: AsyncSession, test_user: User
    ):
        friend = await _add_user(db_session, "friend@example.com", "Friend")
        g = await _add_group(db_session, "Trip", test_user)
        me = await _add_member(db_session, g, test_user)
        them = await _add_member(db_session, g, friend)
        await _add_expense(db_session, g, payer=me, total=100.0, splits=[(me, 50.0), (them, 50.0)])

        resp = await client.get(
            "/api/v1/me/balances/people",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["people"]) == 1
        p = data["people"][0]
        assert p["user_id"] == friend.id
        assert p["name"] == "Friend"
        assert p["balances"] == {"INR": 50.0}
        assert len(p["groups"]) == 1
        assert p["groups"][0]["group_id"] == g.id
        assert p["groups"][0]["balance"] == 50.0

    async def test_owing_one_registered_user(
        self, client: AsyncClient, auth_token: str, db_session: AsyncSession, test_user: User
    ):
        friend = await _add_user(db_session, "friend@example.com", "Friend")
        g = await _add_group(db_session, "Trip", test_user)
        me = await _add_member(db_session, g, test_user)
        them = await _add_member(db_session, g, friend)
        await _add_expense(db_session, g, payer=them, total=100.0, splits=[(me, 50.0), (them, 50.0)])

        resp = await client.get(
            "/api/v1/me/balances/people",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        data = resp.json()
        assert len(data["people"]) == 1
        assert data["people"][0]["balances"] == {"INR": -50.0}
        assert data["people"][0]["groups"][0]["balance"] == -50.0


class TestPeopleBalancesExclusion:
    async def test_solo_group_no_people(
        self, client: AsyncClient, auth_token: str, db_session: AsyncSession, test_user: User
    ):
        g = await _add_group(db_session, "Solo", test_user)
        await _add_member(db_session, g, test_user)
        resp = await client.get(
            "/api/v1/me/balances/people",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.json() == {"people": []}

    async def test_ghost_only_group_no_people(
        self, client: AsyncClient, auth_token: str, db_session: AsyncSession, test_user: User
    ):
        g = await _add_group(db_session, "GhostTrip", test_user)
        me = await _add_member(db_session, g, test_user)
        ghost = await _add_member(db_session, g, None, name="Aarav", is_ghost=True)
        await _add_expense(db_session, g, payer=me, total=100.0, splits=[(me, 50.0), (ghost, 50.0)])
        resp = await client.get(
            "/api/v1/me/balances/people",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.json() == {"people": []}

    async def test_zero_balance_excluded(
        self, client: AsyncClient, auth_token: str, db_session: AsyncSession, test_user: User
    ):
        friend = await _add_user(db_session, "friend@example.com", "Friend")
        g = await _add_group(db_session, "Trip", test_user)
        me = await _add_member(db_session, g, test_user)
        them = await _add_member(db_session, g, friend)
        await _add_expense(db_session, g, payer=me, total=100.0, splits=[(me, 50.0), (them, 50.0)])
        await _add_expense(db_session, g, payer=them, total=100.0, splits=[(me, 50.0), (them, 50.0)])
        resp = await client.get(
            "/api/v1/me/balances/people",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.json() == {"people": []}


class TestPeopleBalancesMultiGroup:
    async def test_same_user_same_currency_two_groups(
        self, client: AsyncClient, auth_token: str, db_session: AsyncSession, test_user: User
    ):
        friend = await _add_user(db_session, "friend@example.com", "Friend")
        g1 = await _add_group(db_session, "Trip A", test_user)
        me1 = await _add_member(db_session, g1, test_user)
        them1 = await _add_member(db_session, g1, friend)
        await _add_expense(db_session, g1, payer=me1, total=100.0, splits=[(me1, 50.0), (them1, 50.0)])
        g2 = await _add_group(db_session, "Trip B", test_user)
        me2 = await _add_member(db_session, g2, test_user)
        them2 = await _add_member(db_session, g2, friend)
        await _add_expense(db_session, g2, payer=me2, total=60.0, splits=[(me2, 30.0), (them2, 30.0)])

        resp = await client.get(
            "/api/v1/me/balances/people",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        data = resp.json()
        assert len(data["people"]) == 1
        p = data["people"][0]
        assert p["balances"] == {"INR": 80.0}
        groups = sorted(p["groups"], key=lambda x: x["balance"], reverse=True)
        assert groups[0]["balance"] == 50.0
        assert groups[1]["balance"] == 30.0

    async def test_same_user_multi_currency(
        self, client: AsyncClient, auth_token: str, db_session: AsyncSession, test_user: User
    ):
        friend = await _add_user(db_session, "friend@example.com", "Friend")
        g1 = await _add_group(db_session, "Trip A", test_user, currency="INR")
        me1 = await _add_member(db_session, g1, test_user)
        them1 = await _add_member(db_session, g1, friend)
        await _add_expense(db_session, g1, payer=me1, total=100.0, splits=[(me1, 50.0), (them1, 50.0)])
        g2 = await _add_group(db_session, "Trip B", test_user, currency="USD")
        me2 = await _add_member(db_session, g2, test_user)
        them2 = await _add_member(db_session, g2, friend)
        await _add_expense(db_session, g2, payer=them2, total=40.0, splits=[(me2, 20.0), (them2, 20.0)])

        resp = await client.get(
            "/api/v1/me/balances/people",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        p = resp.json()["people"][0]
        assert p["balances"] == {"INR": 50.0, "USD": -20.0}
        assert len(p["groups"]) == 2

    async def test_balance_cancels_across_groups_excludes_person(
        self, client: AsyncClient, auth_token: str, db_session: AsyncSession, test_user: User
    ):
        friend = await _add_user(db_session, "friend@example.com", "Friend")
        g1 = await _add_group(db_session, "A", test_user)
        me1 = await _add_member(db_session, g1, test_user)
        them1 = await _add_member(db_session, g1, friend)
        await _add_expense(db_session, g1, payer=me1, total=100.0, splits=[(me1, 50.0), (them1, 50.0)])
        g2 = await _add_group(db_session, "B", test_user)
        me2 = await _add_member(db_session, g2, test_user)
        them2 = await _add_member(db_session, g2, friend)
        await _add_expense(db_session, g2, payer=them2, total=100.0, splits=[(me2, 50.0), (them2, 50.0)])

        resp = await client.get(
            "/api/v1/me/balances/people",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.json() == {"people": []}


class TestPeopleBalancesSorting:
    async def test_sorted_by_absolute_total_descending(
        self, client: AsyncClient, auth_token: str, db_session: AsyncSession, test_user: User
    ):
        small = await _add_user(db_session, "small@example.com", "SmallDebt")
        big = await _add_user(db_session, "big@example.com", "BigDebt")
        g = await _add_group(db_session, "Trip", test_user)
        me = await _add_member(db_session, g, test_user)
        s_mem = await _add_member(db_session, g, small)
        b_mem = await _add_member(db_session, g, big)
        await _add_expense(db_session, g, payer=me, total=300.0,
                            splits=[(me, 50.0), (s_mem, 100.0), (b_mem, 150.0)])

        resp = await client.get(
            "/api/v1/me/balances/people",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        names = [p["name"] for p in resp.json()["people"]]
        assert names == ["BigDebt", "SmallDebt"]


class TestPeopleBalancesAuth:
    async def test_requires_auth(self, client: AsyncClient):
        resp = await client.get("/api/v1/me/balances/people")
        assert resp.status_code in (401, 403)


class TestPeopleBalancesCorrectness:
    """Pairwise-debt correctness: balances must come from settlement_suggestions, not from
    naively flipping the group-level balance of each other member."""

    async def test_three_person_group_current_user_uninvolved(
        self, client: AsyncClient, auth_token: str, db_session: AsyncSession, test_user: User
    ):
        # You are in the group but did not participate in this expense.
        # Aarav pays 100, split 50/50 between Aarav and Priya.
        # Truth: Priya owes Aarav 50; you owe nothing; no one owes you.
        aarav = await _add_user(db_session, "aarav@example.com", "Aarav")
        priya = await _add_user(db_session, "priya@example.com", "Priya")
        g = await _add_group(db_session, "Group", test_user)
        me = await _add_member(db_session, g, test_user)
        a = await _add_member(db_session, g, aarav)
        p = await _add_member(db_session, g, priya)
        # Note: `me` is intentionally NOT in the splits — current user uninvolved.
        await _add_expense(db_session, g, payer=a, total=100.0, splits=[(a, 50.0), (p, 50.0)])

        resp = await client.get(
            "/api/v1/me/balances/people",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 200
        # Current user must not show ANY balances — they were not part of the expense.
        assert resp.json() == {"people": []}

    async def test_three_person_group_current_user_partially_involved(
        self, client: AsyncClient, auth_token: str, db_session: AsyncSession, test_user: User
    ):
        # Aarav pays 90, split equally 30/30/30 among Aarav, Priya, and You.
        # Truth: You owe Aarav 30. Priya owes Aarav 30.
        # Specifically: You do NOT owe Priya; Priya does NOT owe You.
        aarav = await _add_user(db_session, "aarav@example.com", "Aarav")
        priya = await _add_user(db_session, "priya@example.com", "Priya")
        g = await _add_group(db_session, "Group", test_user)
        me = await _add_member(db_session, g, test_user)
        a = await _add_member(db_session, g, aarav)
        p = await _add_member(db_session, g, priya)
        await _add_expense(db_session, g, payer=a, total=90.0, splits=[(a, 30.0), (p, 30.0), (me, 30.0)])

        resp = await client.get(
            "/api/v1/me/balances/people",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        data = resp.json()
        # Only Aarav should appear — you don't owe Priya, Priya doesn't owe you.
        assert len(data["people"]) == 1
        assert data["people"][0]["name"] == "Aarav"
        assert data["people"][0]["balances"] == {"INR": -30.0}

    async def test_three_person_group_you_paid_split_among_others(
        self, client: AsyncClient, auth_token: str, db_session: AsyncSession, test_user: User
    ):
        # You pay 100, split 50/50 between Aarav and Priya. You took none.
        # Truth: Aarav owes you 50. Priya owes you 50.
        aarav = await _add_user(db_session, "aarav@example.com", "Aarav")
        priya = await _add_user(db_session, "priya@example.com", "Priya")
        g = await _add_group(db_session, "Group", test_user)
        me = await _add_member(db_session, g, test_user)
        a = await _add_member(db_session, g, aarav)
        p = await _add_member(db_session, g, priya)
        await _add_expense(db_session, g, payer=me, total=100.0, splits=[(a, 50.0), (p, 50.0)])

        resp = await client.get(
            "/api/v1/me/balances/people",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        people = resp.json()["people"]
        # Both Aarav and Priya should owe you 50.
        assert len(people) == 2
        names = {p["name"]: p["balances"] for p in people}
        assert names == {"Aarav": {"INR": 50.0}, "Priya": {"INR": 50.0}}

    async def test_chain_of_debt_through_third_party(
        self, client: AsyncClient, auth_token: str, db_session: AsyncSession, test_user: User
    ):
        # 4-person group. Two separate transactions you weren't part of:
        #   Aarav pays 60 split 30/30 between Aarav and Priya — Priya owes Aarav 30
        #   Sam pays 40 split 20/20 between Sam and Aarav — Aarav owes Sam 20
        # You: in the group, no transactions. Should appear with NO balances.
        aarav = await _add_user(db_session, "aarav@example.com", "Aarav")
        priya = await _add_user(db_session, "priya@example.com", "Priya")
        sam = await _add_user(db_session, "sam@example.com", "Sam")
        g = await _add_group(db_session, "Group", test_user)
        me = await _add_member(db_session, g, test_user)
        a = await _add_member(db_session, g, aarav)
        p = await _add_member(db_session, g, priya)
        s = await _add_member(db_session, g, sam)
        await _add_expense(db_session, g, payer=a, total=60.0, splits=[(a, 30.0), (p, 30.0)])
        await _add_expense(db_session, g, payer=s, total=40.0, splits=[(s, 20.0), (a, 20.0)])

        resp = await client.get(
            "/api/v1/me/balances/people",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.json() == {"people": []}
