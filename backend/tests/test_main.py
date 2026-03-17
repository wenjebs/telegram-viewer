"""Tests for main.py (health check, AuthKeyError handler, CORS)."""

from __future__ import annotations


import pytest
from httpx import ASGITransport, AsyncClient
from telethon.errors import AuthKeyError

from main import app


@pytest.mark.asyncio
async def test_health_check():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_auth_key_error_returns_401(mock_tg):
    mock_tg.is_authenticated.side_effect = AuthKeyError(request=None, message="AUTH_KEY_DUPLICATED")
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.get("/auth/status")
    assert resp.status_code == 401
    assert resp.json() == {"detail": "Session invalid or revoked"}


@pytest.mark.asyncio
async def test_cors_headers():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.options(
            "/health",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "GET",
            },
        )
    assert resp.status_code == 200
    assert "access-control-allow-origin" in resp.headers
    assert resp.headers["access-control-allow-origin"] == "http://localhost:3000"
