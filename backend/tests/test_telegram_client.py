import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from telegram_client import TelegramClientWrapper


@pytest.fixture
def mock_telethon():
    with patch("telegram_client.TelegramClient") as MockClient:
        client = AsyncMock()
        MockClient.return_value = client
        client.is_connected.return_value = False
        yield client


@pytest.mark.asyncio
async def test_is_authenticated_no_session(mock_telethon):
    mock_telethon.is_user_authorized.return_value = False
    wrapper = TelegramClientWrapper(api_id=123, api_hash="abc", session_path="test")
    await wrapper.connect()
    result = await wrapper.is_authenticated()
    assert result is False


@pytest.mark.asyncio
async def test_is_authenticated_with_session(mock_telethon):
    mock_telethon.is_user_authorized.return_value = True
    wrapper = TelegramClientWrapper(api_id=123, api_hash="abc", session_path="test")
    await wrapper.connect()
    result = await wrapper.is_authenticated()
    assert result is True


@pytest.mark.asyncio
async def test_send_code(mock_telethon):
    mock_telethon.send_code_request.return_value = MagicMock(phone_code_hash="hash123")
    wrapper = TelegramClientWrapper(api_id=123, api_hash="abc", session_path="test")
    await wrapper.connect()
    result = await wrapper.send_code("+1234567890")
    assert result == "hash123"
    mock_telethon.send_code_request.assert_called_once_with("+1234567890")


@pytest.mark.asyncio
async def test_verify_code(mock_telethon):
    mock_telethon.sign_in.return_value = MagicMock()
    wrapper = TelegramClientWrapper(api_id=123, api_hash="abc", session_path="test")
    await wrapper.connect()
    await wrapper.verify_code("+1234567890", "12345", "hash123")
    mock_telethon.sign_in.assert_called_once_with(
        phone="+1234567890", code="12345", phone_code_hash="hash123"
    )
