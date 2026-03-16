from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING

from fastapi import Request

if TYPE_CHECKING:
    import aiosqlite

    from telegram_client import TelegramClientWrapper


def get_db(request: Request) -> aiosqlite.Connection:
    return request.app.state.db


def get_tg(request: Request) -> TelegramClientWrapper:
    return request.app.state.tg


def get_sync_status(request: Request) -> dict[int, dict]:
    return request.app.state.sync_status


def get_background_tasks(request: Request) -> set[asyncio.Task]:
    return request.app.state.background_tasks
