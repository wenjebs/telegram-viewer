"""Tests for utils.py (fire_and_forget, utc_now_iso, parse_cursor, build_media_response)."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from unittest.mock import patch

import pytest
from fastapi import HTTPException

from utils import build_media_response, fire_and_forget, parse_cursor, utc_now_iso


# ---------------------------------------------------------------------------
# fire_and_forget
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_fire_and_forget_adds_task_to_set():
    task_set: set[asyncio.Task] = set()

    async def noop():
        pass

    task = fire_and_forget(noop(), task_set)
    assert task in task_set
    await task
    # After completion, callback removes it
    await asyncio.sleep(0)  # let callbacks run
    assert task not in task_set


@pytest.mark.asyncio
async def test_fire_and_forget_removes_task_on_completion():
    task_set: set[asyncio.Task] = set()

    async def quick():
        return 42

    task = fire_and_forget(quick(), task_set)
    await task
    await asyncio.sleep(0)
    assert task not in task_set


@pytest.mark.asyncio
async def test_fire_and_forget_logs_exception():
    task_set: set[asyncio.Task] = set()

    async def fail():
        raise ValueError("boom")

    with patch("utils.logger") as mock_logger:
        task = fire_and_forget(fail(), task_set)
        # Suppress the "Task exception was never retrieved" warning
        try:
            await task
        except ValueError:
            pass
        await asyncio.sleep(0)
        mock_logger.error.assert_called_once()
        assert "boom" in str(mock_logger.error.call_args)
    assert task not in task_set


@pytest.mark.asyncio
async def test_fire_and_forget_cancelled_task_no_log():
    task_set: set[asyncio.Task] = set()

    async def slow():
        await asyncio.sleep(100)

    with patch("utils.logger") as mock_logger:
        task = fire_and_forget(slow(), task_set)
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        await asyncio.sleep(0)
        mock_logger.error.assert_not_called()
    assert task not in task_set


# ---------------------------------------------------------------------------
# utc_now_iso
# ---------------------------------------------------------------------------


def test_utc_now_iso_format():
    result = utc_now_iso()
    # Should be parseable as ISO 8601
    dt = datetime.fromisoformat(result)
    assert dt.tzinfo is not None
    # Should be very close to now
    diff = abs((datetime.now(timezone.utc) - dt).total_seconds())
    assert diff < 2


def test_utc_now_iso_contains_timezone():
    result = utc_now_iso()
    # UTC offset should appear as +00:00
    assert "+00:00" in result


# ---------------------------------------------------------------------------
# parse_cursor
# ---------------------------------------------------------------------------


def test_parse_cursor_none():
    assert parse_cursor(None) == (None, None)


def test_parse_cursor_composite():
    cursor_id, cursor_value = parse_cursor("2026-03-15T10:00:00|42")
    assert cursor_id == 42
    assert cursor_value == "2026-03-15T10:00:00"


def test_parse_cursor_plain_integer():
    cursor_id, cursor_value = parse_cursor("123")
    assert cursor_id == 123
    assert cursor_value is None


def test_parse_cursor_invalid_raises():
    with pytest.raises(HTTPException) as exc_info:
        parse_cursor("not-a-number")
    assert exc_info.value.status_code == 400


def test_parse_cursor_composite_with_pipe_in_value():
    # Value may contain pipes; rsplit("|", 1) should handle it
    cursor_id, cursor_value = parse_cursor("a|b|99")
    assert cursor_id == 99
    assert cursor_value == "a|b"


# ---------------------------------------------------------------------------
# build_media_response
# ---------------------------------------------------------------------------


def test_build_media_response_normalizes_date_space():
    items = [{"id": 1, "date": "2026-03-15 10:00:00", "file_ref": b"ref"}]
    result = build_media_response(items, limit=10)
    assert result["items"][0]["date"] == "2026-03-15T10:00:00"


def test_build_media_response_strips_file_ref():
    items = [{"id": 1, "date": "2026-03-15T10:00:00", "file_ref": b"ref"}]
    result = build_media_response(items, limit=10)
    assert "file_ref" not in result["items"][0]


def test_build_media_response_next_cursor_when_full():
    items = [
        {"id": i, "date": f"2026-03-{15 - i:02d}T10:00:00"}
        for i in range(3)
    ]
    result = build_media_response(items, limit=3)
    assert result["next_cursor"] == "2026-03-13T10:00:00|2"


def test_build_media_response_no_next_cursor_when_partial():
    items = [{"id": 1, "date": "2026-03-15T10:00:00"}]
    result = build_media_response(items, limit=10)
    assert result["next_cursor"] is None


def test_build_media_response_empty_items():
    result = build_media_response([], limit=10)
    assert result == {"items": [], "next_cursor": None}
