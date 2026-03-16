from __future__ import annotations

import asyncio
import os
from telethon import TelegramClient
from telethon.errors import SessionPasswordNeededError


class TelegramClientWrapper:
    def __init__(self, api_id: int, api_hash: str, session_path: str = "tg_session"):
        self._client = TelegramClient(session_path, api_id, api_hash)
        self._semaphore = asyncio.Semaphore(3)  # limit concurrent Telegram requests

    @property
    def client(self) -> TelegramClient:
        return self._client

    async def connect(self) -> None:
        if not self._client.is_connected():
            await self._client.connect()

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
            await self._client.sign_in(phone=phone, code=code, phone_code_hash=phone_code_hash)
        except SessionPasswordNeededError:
            if password is None:
                raise
            await self._client.sign_in(password=password)

    async def logout(self) -> None:
        await self._client.log_out()

    async def get_dialogs(self) -> list[dict]:
        dialogs = await self._client.get_dialogs()
        return [
            {
                "id": d.id,
                "name": d.name,
                "type": _dialog_type(d),
                "unread_count": d.unread_count,
            }
            for d in dialogs
        ]

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
