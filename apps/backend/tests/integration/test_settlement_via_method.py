"""Settlement creation accepts and persists via_payment_method."""
import pytest


class TestSettlementVia:
    async def test_create_settlement_with_via_payment_method(
        self, client, auth_token, db_session, test_group_with_members
    ):
        group, members = test_group_with_members
        resp = await client.post(
            f"/api/v1/groups/{group.id}/settlements",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "from_member_id": members[0].id,
                "to_member_id": members[1].id,
                "amount": 100.0,
                "via_payment_method": "upi",
            },
        )
        assert resp.status_code == 200

        listed = await client.get(
            f"/api/v1/groups/{group.id}/settlements",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert listed.status_code == 200
        assert listed.json()[0]["via_payment_method"] == "upi"

    async def test_create_settlement_without_via_defaults_to_null(
        self, client, auth_token, test_group_with_members
    ):
        group, members = test_group_with_members
        resp = await client.post(
            f"/api/v1/groups/{group.id}/settlements",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "from_member_id": members[0].id,
                "to_member_id": members[1].id,
                "amount": 50.0,
            },
        )
        assert resp.status_code == 200

        listed = (await client.get(
            f"/api/v1/groups/{group.id}/settlements",
            headers={"Authorization": f"Bearer {auth_token}"},
        )).json()
        assert listed[0]["via_payment_method"] is None

    async def test_create_settlement_rejects_invalid_via(
        self, client, auth_token, test_group_with_members
    ):
        group, members = test_group_with_members
        resp = await client.post(
            f"/api/v1/groups/{group.id}/settlements",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "from_member_id": members[0].id,
                "to_member_id": members[1].id,
                "amount": 50.0,
                "via_payment_method": "bitcoin",
            },
        )
        assert resp.status_code == 422
