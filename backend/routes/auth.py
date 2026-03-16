from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from deps import get_tg

if TYPE_CHECKING:
    from telegram_client import TelegramClientWrapper

router = APIRouter(prefix="/auth", tags=["auth"])


class SendCodeRequest(BaseModel):
    phone: str


class VerifyRequest(BaseModel):
    phone: str
    code: str
    phone_code_hash: str
    password: str | None = None


@router.get("/status")
async def auth_status(tg: TelegramClientWrapper = Depends(get_tg)):
    authenticated = await tg.is_authenticated()
    return {"authenticated": authenticated}


@router.post("/send-code")
async def send_code(req: SendCodeRequest, tg: TelegramClientWrapper = Depends(get_tg)):
    phone_code_hash = await tg.send_code(req.phone)
    return {"phone_code_hash": phone_code_hash}


@router.post("/verify")
async def verify(req: VerifyRequest, tg: TelegramClientWrapper = Depends(get_tg)):
    try:
        await tg.verify_code(req.phone, req.code, req.phone_code_hash, req.password)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"success": True}


@router.post("/logout")
async def logout(tg: TelegramClientWrapper = Depends(get_tg)):
    await tg.logout()
    return {"success": True}
