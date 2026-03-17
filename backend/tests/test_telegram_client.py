import time

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from telegram_client import TelegramClientWrapper, _dialog_type


@pytest.fixture
def mock_telethon():
    with patch("telegram_client.TelegramClient") as MockClient:
        client = AsyncMock()
        MockClient.return_value = client
        client.is_connected.return_value = False
        yield client


@pytest.fixture
def wrapper(mock_telethon):
    """Return a TelegramClientWrapper with mocked Telethon client."""
    return TelegramClientWrapper(api_id=123, api_hash="abc", session_path="test")


# ---------------------------------------------------------------------------
# Original tests
# ---------------------------------------------------------------------------


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


# ---------------------------------------------------------------------------
# get_dialogs: cache behaviour
# ---------------------------------------------------------------------------

def _make_dialog(*, is_user=False, is_group=False, is_channel=False, name="Chat"):
    d = MagicMock()
    d.id = 1
    d.name = name
    d.is_user = is_user
    d.is_group = is_group
    d.is_channel = is_channel
    d.unread_count = 0
    d.date = None
    return d


@pytest.mark.asyncio
async def test_get_dialogs_cache_hit(wrapper, mock_telethon):
    """Fresh cache should be returned without calling Telegram."""
    wrapper._dialogs_cache = [{"id": 1, "name": "cached"}]
    wrapper._dialogs_cache_time = time.monotonic()  # fresh
    result = await wrapper.get_dialogs()
    assert result == [{"id": 1, "name": "cached"}]
    mock_telethon.get_dialogs.assert_not_called()


@pytest.mark.asyncio
async def test_get_dialogs_stale_cache_returns_immediately(wrapper, mock_telethon):
    """Stale cache should be returned while background refresh is triggered."""
    wrapper._dialogs_cache = [{"id": 1, "name": "stale"}]
    wrapper._dialogs_cache_time = time.monotonic() - 120  # stale

    # Don't actually do background refresh (no db set)
    result = await wrapper.get_dialogs()
    assert result == [{"id": 1, "name": "stale"}]


@pytest.mark.asyncio
async def test_get_dialogs_no_cache_blocks(wrapper, mock_telethon):
    """No cache at all should block on Telegram fetch."""
    mock_telethon.get_dialogs.return_value = [
        _make_dialog(is_group=True, name="TestGroup")
    ]
    result = await wrapper.get_dialogs()
    assert len(result) == 1
    assert result[0]["name"] == "TestGroup"
    mock_telethon.get_dialogs.assert_called_once()


# ---------------------------------------------------------------------------
# refresh_dialogs: concurrent guard
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_refresh_dialogs_concurrent_guard(wrapper, mock_telethon):
    """Setting _refreshing=True should prevent a second refresh."""
    wrapper._refreshing = True
    await wrapper.refresh_dialogs()
    mock_telethon.get_dialogs.assert_not_called()
    # Flag should remain True (caller set it)
    assert wrapper._refreshing is True


@pytest.mark.asyncio
async def test_refresh_dialogs_sets_and_clears_flag(wrapper, mock_telethon):
    """Normal refresh should set _refreshing and clear it after."""
    mock_telethon.get_dialogs.return_value = [
        _make_dialog(is_user=True, name="Alice")
    ]
    assert wrapper._refreshing is False
    await wrapper.refresh_dialogs()
    assert wrapper._refreshing is False
    assert wrapper._dialogs_cache is not None


# ---------------------------------------------------------------------------
# _dialog_type
# ---------------------------------------------------------------------------


def test_dialog_type_dm():
    d = _make_dialog(is_user=True)
    assert _dialog_type(d) == "dm"


def test_dialog_type_group():
    d = _make_dialog(is_group=True)
    assert _dialog_type(d) == "group"


def test_dialog_type_channel():
    d = _make_dialog(is_channel=True)
    assert _dialog_type(d) == "channel"


def test_dialog_type_other():
    d = _make_dialog()
    assert _dialog_type(d) == "other"


# ---------------------------------------------------------------------------
# is_cache_stale property
# ---------------------------------------------------------------------------


def test_is_cache_stale_no_cache(wrapper):
    assert wrapper.is_cache_stale is True


def test_is_cache_stale_fresh(wrapper):
    wrapper._dialogs_cache = [{"id": 1}]
    wrapper._dialogs_cache_time = time.monotonic()
    assert wrapper.is_cache_stale is False


def test_is_cache_stale_old(wrapper):
    wrapper._dialogs_cache = [{"id": 1}]
    wrapper._dialogs_cache_time = time.monotonic() - 120
    assert wrapper.is_cache_stale is True


# ---------------------------------------------------------------------------
# acquire_semaphore / release_semaphore
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_acquire_and_release_semaphore(wrapper):
    await wrapper.acquire_semaphore()
    # Semaphore value should have decremented (default is 6, now 5 slots free)
    assert wrapper._semaphore._value == 5
    wrapper.release_semaphore()
    assert wrapper._semaphore._value == 6
