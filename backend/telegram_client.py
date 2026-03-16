from __future__ import annotations

import asyncio
import logging
import time
from telethon import TelegramClient
from telethon.errors import SessionPasswordNeededError

from database import upsert_dialogs_batch
from utils import fire_and_forget

logger = logging.getLogger(__name__)


class TelegramClientWrapper:
    def __init__(
        self,
        api_id: int,
        api_hash: str,
        session_path: str = "tg_session",
        background_tasks: set[asyncio.Task] | None = None,
    ):
        self._client = TelegramClient(session_path, api_id, api_hash)
        self._semaphore = asyncio.Semaphore(6)  # limit concurrent Telegram requests
        self._dialogs_cache: list[dict] | None = None
        self._dialogs_cache_time: float = 0
        self._refreshing = False
        self._db = None
        self._background_tasks: set[asyncio.Task] = (
            background_tasks if background_tasks is not None else set()
        )

    @property
    def client(self) -> TelegramClient:
        return self._client

    def set_db(self, db) -> None:
        self._db = db

    async def connect(self) -> None:
        if not self._client.is_connected():
            await self._client.connect()
        # Kick off initial dialog refresh in background if DB is available
        if self._db is not None:
            fire_and_forget(self.refresh_dialogs(), self._background_tasks)

    async def disconnect(self) -> None:
        await self._client.disconnect()

    async def is_authenticated(self) -> bool:
        return await self._client.is_user_authorized()

    async def send_code(self, phone: str) -> str:
        result = await self._client.send_code_request(phone)
        return result.phone_code_hash

    async def verify_code(
        self, phone: str, code: str, phone_code_hash: str, password: str | None = None
    ) -> None:
        try:
            await self._client.sign_in(
                phone=phone, code=code, phone_code_hash=phone_code_hash
            )
        except SessionPasswordNeededError:
            if password is None:
                raise
            await self._client.sign_in(password=password)

    async def logout(self) -> None:
        await self._client.log_out()

    async def get_dialogs(self) -> list[dict]:
        """Return cached dialogs, triggering background refresh if stale."""
        now = time.monotonic()
        if self._dialogs_cache is not None and now - self._dialogs_cache_time < 60:
            return self._dialogs_cache
        # Cache is stale — trigger background refresh (non-blocking)
        if self._db is not None:
            fire_and_forget(self.refresh_dialogs(), self._background_tasks)
        # If we have stale cache, return it immediately while refresh runs
        if self._dialogs_cache is not None:
            return self._dialogs_cache
        # No cache at all — must block on Telegram fetch
        return await self._fetch_dialogs_from_telegram()

    async def _fetch_dialogs_from_telegram(self) -> list[dict]:
        """Fetch dialogs from Telegram API, update in-memory cache and DB."""
        dialogs = await self._client.get_dialogs()
        result = [
            {
                "id": d.id,
                "name": d.name,
                "type": _dialog_type(d),
                "unread_count": d.unread_count,
                "last_message_date": d.date.isoformat() if d.date else None,
            }
            for d in dialogs
        ]
        self._dialogs_cache = result
        self._dialogs_cache_time = time.monotonic()
        if self._db is not None:
            await upsert_dialogs_batch(self._db, result)
        return result

    @property
    def is_cache_stale(self) -> bool:
        return (
            self._dialogs_cache is None
            or time.monotonic() - self._dialogs_cache_time >= 60
        )

    async def refresh_dialogs(self) -> None:
        """Fetch dialogs from Telegram and persist to DB. Safe to call concurrently."""
        if self._refreshing:
            return
        self._refreshing = True
        try:
            await self._fetch_dialogs_from_telegram()
        except Exception:
            logger.exception("Background dialog refresh failed")
        finally:
            self._refreshing = False

    async def acquire_semaphore(self):
        await self._semaphore.acquire()

    def release_semaphore(self):
        self._semaphore.release()


def _dialog_type(dialog) -> str:
    if dialog.is_user:
        return "dm"
    if dialog.is_group:
        return "group"
    if dialog.is_channel:
        return "channel"
    return "other"
