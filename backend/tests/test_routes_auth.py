import pytest
from unittest.mock import AsyncMock, patch
from httpx import AsyncClient, ASGITransport
from main import app


@pytest.fixture
def mock_tg():
    with patch("routes.auth.get_tg") as mock:
        tg = AsyncMock()
        mock.return_value = tg
        yield tg


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
