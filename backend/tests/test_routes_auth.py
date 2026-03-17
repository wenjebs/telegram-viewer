import pytest
from unittest.mock import AsyncMock
from httpx import AsyncClient, ASGITransport

from main import app


@pytest.mark.asyncio
async def test_auth_status_not_authenticated(mock_tg):
    mock_tg.is_authenticated.return_value = False
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.get("/auth/status")
    assert resp.status_code == 200
    assert resp.json() == {"authenticated": False}


@pytest.mark.asyncio
async def test_auth_status_authenticated(mock_tg):
    mock_tg.is_authenticated.return_value = True
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.get("/auth/status")
    assert resp.status_code == 200
    assert resp.json() == {"authenticated": True}


@pytest.mark.asyncio
async def test_send_code(mock_tg):
    mock_tg.send_code.return_value = "hash123"
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.post("/auth/send-code", json={"phone": "+1234567890"})
    assert resp.status_code == 200
    assert resp.json() == {"phone_code_hash": "hash123"}


@pytest.mark.asyncio
async def test_verify_code(mock_tg):
    mock_tg.verify_code = AsyncMock()
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.post(
            "/auth/verify",
            json={
                "phone": "+1234567890",
                "code": "12345",
                "phone_code_hash": "hash123",
            },
        )
    assert resp.status_code == 200
    assert resp.json() == {"success": True}


# ---------------------------------------------------------------------------
# New tests: logout, verify with password, verify failure
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_logout(mock_tg):
    mock_tg.logout = AsyncMock()
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.post("/auth/logout")
    assert resp.status_code == 200
    assert resp.json() == {"success": True}
    mock_tg.logout.assert_called_once()


@pytest.mark.asyncio
async def test_verify_with_password(mock_tg):
    """When verify_code raises SessionPasswordNeededError the route should still succeed
    if a password is provided (the wrapper handles the retry internally)."""
    mock_tg.verify_code = AsyncMock()  # success path with password
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.post(
            "/auth/verify",
            json={
                "phone": "+1234567890",
                "code": "12345",
                "phone_code_hash": "hash123",
                "password": "secret",
            },
        )
    assert resp.status_code == 200
    assert resp.json() == {"success": True}
    mock_tg.verify_code.assert_called_once_with(
        "+1234567890", "12345", "hash123", "secret"
    )


@pytest.mark.asyncio
async def test_verify_failure_returns_400(mock_tg):
    mock_tg.verify_code = AsyncMock(side_effect=Exception("Invalid code"))
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.post(
            "/auth/verify",
            json={
                "phone": "+1234567890",
                "code": "99999",
                "phone_code_hash": "hash123",
            },
        )
    assert resp.status_code == 400
    assert "Invalid code" in resp.json()["detail"]
