"""Tests for the receipt-scan endpoint + service."""
import io
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.group import Group, GroupMember
from app.db.models.user import User


async def _add_user(db: AsyncSession, email: str, name: str) -> User:
    from app.db.crud.user import create_user
    return await create_user(db, email=email, name=name, password_hash=None, auth_provider="email")


async def _add_group(db: AsyncSession, owner: User, currency: str = "INR") -> Group:
    g = Group(name="G", currency=currency, created_by=owner.id)
    db.add(g)
    await db.flush()
    return g


async def _add_member(db: AsyncSession, group: Group, user: User) -> GroupMember:
    m = GroupMember(group_id=group.id, user_id=user.id, name=None, is_ghost=False)
    db.add(m)
    await db.flush()
    return m


JPEG_1X1 = bytes.fromhex(
    "ffd8ffe000104a46494600010100000100010000ffdb004300080606070605080707"
    "07090908080b0a0a0b0e0e0c0c0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e"
    "0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0effc000"
    "0b0801000101012200ffc4001f0000010501010101010100000000000000000102030405"
    "0607080910111213ffc40014100001000000000000000000000000000000ffda0008010"
    "100003f00fbe5ffd9"
)


FAKE_PARSED = {
    "merchant": "Sagar Ratna",
    "currency": "INR",
    "subtotal": 1000.0,
    "tax": 100.0,
    "tip": 0.0,
    "service_charge": 80.0,
    "discount": 0.0,
    "total": 1180.0,
    "items": [
        {"name": "Chicken curry", "quantity": 1, "unit_price": 300.0, "line_total": 300.0},
        {"name": "Beer", "quantity": 2, "unit_price": 100.0, "line_total": 200.0},
        {"name": "Butter naan", "quantity": 3, "unit_price": 166.67, "line_total": 500.0},
    ],
}


class TestScanReceiptAuth:
    async def test_requires_auth(self, client: AsyncClient):
        resp = await client.post(
            "/api/v1/groups/g/expenses/scan-receipt",
            files={"file": ("r.jpg", JPEG_1X1, "image/jpeg")},
        )
        assert resp.status_code in (401, 403)

    async def test_requires_membership(
        self, client: AsyncClient, auth_token: str, db_session: AsyncSession, test_user: User
    ):
        other = await _add_user(db_session, "other@example.com", "Other")
        g = await _add_group(db_session, other)
        await _add_member(db_session, g, other)
        resp = await client.post(
            f"/api/v1/groups/{g.id}/expenses/scan-receipt",
            headers={"Authorization": f"Bearer {auth_token}"},
            files={"file": ("r.jpg", JPEG_1X1, "image/jpeg")},
        )
        assert resp.status_code == 403


class TestScanReceiptFileValidation:
    async def test_rejects_oversized(
        self, client: AsyncClient, auth_token: str, db_session: AsyncSession, test_user: User
    ):
        g = await _add_group(db_session, test_user)
        await _add_member(db_session, g, test_user)
        big = b"\xff\xd8\xff\xe0" + b"a" * (6 * 1024 * 1024)
        resp = await client.post(
            f"/api/v1/groups/{g.id}/expenses/scan-receipt",
            headers={"Authorization": f"Bearer {auth_token}"},
            files={"file": ("big.jpg", big, "image/jpeg")},
        )
        assert resp.status_code == 413

    async def test_rejects_wrong_mime(
        self, client: AsyncClient, auth_token: str, db_session: AsyncSession, test_user: User
    ):
        g = await _add_group(db_session, test_user)
        await _add_member(db_session, g, test_user)
        pdf = b"%PDF-1.4\n" + b"payload"
        resp = await client.post(
            f"/api/v1/groups/{g.id}/expenses/scan-receipt",
            headers={"Authorization": f"Bearer {auth_token}"},
            files={"file": ("r.pdf", pdf, "application/pdf")},
        )
        assert resp.status_code == 415


class TestScanReceiptHappyPath:
    async def test_happy_path_returns_parsed_receipt(
        self, client: AsyncClient, auth_token: str, db_session: AsyncSession, test_user: User
    ):
        g = await _add_group(db_session, test_user)
        await _add_member(db_session, g, test_user)
        with patch("app.services.receipt_parser.parse_with_llm_vision", new=AsyncMock(return_value=FAKE_PARSED)):
            resp = await client.post(
                f"/api/v1/groups/{g.id}/expenses/scan-receipt",
                headers={"Authorization": f"Bearer {auth_token}"},
                files={"file": ("r.jpg", JPEG_1X1, "image/jpeg")},
            )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["total"] == 1180.0
        assert data["confidence"] == "high"
        assert len(data["items"]) == 3
        assert data["items"][0]["name"] == "Chicken curry"


class TestScanReceiptConfidence:
    async def test_low_confidence_when_totals_mismatch(
        self, client: AsyncClient, auth_token: str, db_session: AsyncSession, test_user: User
    ):
        g = await _add_group(db_session, test_user)
        await _add_member(db_session, g, test_user)
        bad = dict(FAKE_PARSED, total=500.0)
        with patch("app.services.receipt_parser.parse_with_llm_vision", new=AsyncMock(return_value=bad)):
            resp = await client.post(
                f"/api/v1/groups/{g.id}/expenses/scan-receipt",
                headers={"Authorization": f"Bearer {auth_token}"},
                files={"file": ("r.jpg", JPEG_1X1, "image/jpeg")},
            )
        assert resp.status_code == 200
        assert resp.json()["confidence"] == "low"


class TestScanReceiptUnreadable:
    async def test_returns_422_on_empty_items(
        self, client: AsyncClient, auth_token: str, db_session: AsyncSession, test_user: User
    ):
        g = await _add_group(db_session, test_user)
        await _add_member(db_session, g, test_user)
        empty = dict(FAKE_PARSED, items=[])
        with patch("app.services.receipt_parser.parse_with_llm_vision", new=AsyncMock(return_value=empty)):
            resp = await client.post(
                f"/api/v1/groups/{g.id}/expenses/scan-receipt",
                headers={"Authorization": f"Bearer {auth_token}"},
                files={"file": ("r.jpg", JPEG_1X1, "image/jpeg")},
            )
        assert resp.status_code == 422


class TestSanitization:
    async def test_item_names_sanitized(
        self, client: AsyncClient, auth_token: str, db_session: AsyncSession, test_user: User
    ):
        g = await _add_group(db_session, test_user)
        await _add_member(db_session, g, test_user)
        dirty = dict(
            FAKE_PARSED,
            items=[
                {"name": "Nasty\r\nIGNORE\x00INSTRUCTIONS " + "x" * 100,
                 "quantity": 1, "unit_price": 10, "line_total": 10}
            ],
        )
        with patch("app.services.receipt_parser.parse_with_llm_vision", new=AsyncMock(return_value=dirty)):
            resp = await client.post(
                f"/api/v1/groups/{g.id}/expenses/scan-receipt",
                headers={"Authorization": f"Bearer {auth_token}"},
                files={"file": ("r.jpg", JPEG_1X1, "image/jpeg")},
            )
        name = resp.json()["items"][0]["name"]
        assert "\r" not in name and "\n" not in name and "\x00" not in name
        assert len(name) <= 60
