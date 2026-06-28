"""Tests for the PUT /me/payment-methods endpoint."""
import pytest
from httpx import AsyncClient


class TestPaymentMethods:
    async def test_get_me_includes_payment_methods_default_empty(
        self, client: AsyncClient, auth_token: str
    ):
        resp = await client.get(
            "/api/v1/me",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["payment_methods"] == []

    async def test_put_payment_methods_happy_path(
        self, client: AsyncClient, auth_token: str
    ):
        resp = await client.put(
            "/api/v1/me/payment-methods",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "payment_methods": [
                    {"type": "upi", "value": "test@okicici"},
                    {"type": "paypal", "value": "paypal.me/test"},
                ]
            },
        )
        assert resp.status_code == 200
        assert resp.json()["payment_methods"] == [
            {"type": "upi", "value": "test@okicici"},
            {"type": "paypal", "value": "paypal.me/test"},
        ]
        # Round-trip via /me
        me = (await client.get(
            "/api/v1/me",
            headers={"Authorization": f"Bearer {auth_token}"},
        )).json()
        assert len(me["payment_methods"]) == 2

    async def test_put_payment_methods_replaces_existing(
        self, client: AsyncClient, auth_token: str
    ):
        # Set two
        await client.put(
            "/api/v1/me/payment-methods",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"payment_methods": [
                {"type": "upi", "value": "a@b"},
                {"type": "paypal", "value": "paypal.me/x"},
            ]},
        )
        # Replace with one
        resp = await client.put(
            "/api/v1/me/payment-methods",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"payment_methods": [{"type": "venmo", "value": "@new"}]},
        )
        assert resp.status_code == 200
        assert resp.json()["payment_methods"] == [
            {"type": "venmo", "value": "@new"}
        ]

    async def test_put_payment_methods_rejects_invalid_type(
        self, client: AsyncClient, auth_token: str
    ):
        resp = await client.put(
            "/api/v1/me/payment-methods",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"payment_methods": [{"type": "bitcoin", "value": "1A1..."}]},
        )
        assert resp.status_code == 422

    async def test_put_payment_methods_rejects_invalid_upi_format(
        self, client: AsyncClient, auth_token: str
    ):
        resp = await client.put(
            "/api/v1/me/payment-methods",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"payment_methods": [{"type": "upi", "value": "not-a-vpa"}]},
        )
        assert resp.status_code == 400
        assert "upi" in resp.json()["detail"].lower()

    async def test_put_payment_methods_empty_list_clears(
        self, client: AsyncClient, auth_token: str
    ):
        await client.put(
            "/api/v1/me/payment-methods",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"payment_methods": [{"type": "upi", "value": "a@b"}]},
        )
        resp = await client.put(
            "/api/v1/me/payment-methods",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"payment_methods": []},
        )
        assert resp.status_code == 200
        assert resp.json()["payment_methods"] == []

    async def test_put_payment_methods_requires_auth(self, client: AsyncClient):
        resp = await client.put(
            "/api/v1/me/payment-methods",
            json={"payment_methods": []},
        )
        assert resp.status_code in (401, 403)

    async def test_group_member_listing_includes_payment_methods(
        self, client, auth_token, test_group_with_members
    ):
        group, members = test_group_with_members
        # Set methods on the test user
        await client.put(
            "/api/v1/me/payment-methods",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"payment_methods": [{"type": "upi", "value": "me@okicici"}]},
        )
        # Fetch the group
        resp = await client.get(
            f"/api/v1/groups/{group.id}",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 200
        # Find the registered member whose user_id matches the auth user
        body = resp.json()
        members_with_user = [m for m in body["members"] if m.get("user_id")]
        assert len(members_with_user) >= 1
        # At least one of them should have the UPI we set
        upis = [
            pm["value"]
            for m in members_with_user
            for pm in (m.get("payment_methods") or [])
            if pm.get("type") == "upi"
        ]
        assert "me@okicici" in upis
