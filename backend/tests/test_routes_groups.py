import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from httpx import AsyncClient, ASGITransport
from main import app


@pytest.fixture
def mock_tg():
    with patch("routes.groups.get_tg") as mock:
        tg = AsyncMock()
        mock.return_value = tg
        yield tg


@pytest.fixture
def mock_db():
    with patch("routes.groups.get_db") as mock:
        db = AsyncMock()
        mock.return_value = db
        yield db


@pytest.mark.asyncio
async def test_list_groups(mock_tg, mock_db):
    mock_tg.get_dialogs.return_value = [
        {"id": 1, "name": "Group1", "type": "group", "unread_count": 0},
        {"id": 2, "name": "Channel1", "type": "channel", "unread_count": 5},
    ]
    mock_db.return_value = None  # no sync state

    with patch("routes.groups.get_sync_state", new_callable=AsyncMock, return_value=None):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/groups")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    assert data[0]["name"] == "Group1"


@pytest.mark.asyncio
async def test_toggle_group_active(mock_tg, mock_db):
    with patch("routes.groups.upsert_sync_state", new_callable=AsyncMock) as mock_upsert:
        with patch("routes.groups.get_tg") as m_tg:
            m_tg.return_value = mock_tg
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.patch("/groups/1/active", json={"active": True, "chat_name": "Test"})
    assert resp.status_code == 200
