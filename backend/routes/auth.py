from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/auth", tags=["auth"])

# This will be set by main.py at startup
_tg = None


def set_tg(tg):
    global _tg
    _tg = tg


def get_tg():
    return _tg


class SendCodeRequest(BaseModel):
    phone: str


class VerifyRequest(BaseModel):
    phone: str
    code: str
    phone_code_hash: str
    password: str | None = None


@router.get("/status")
async def auth_status():
    tg = get_tg()
    authenticated = await tg.is_authenticated()
    return {"authenticated": authenticated}


@router.post("/send-code")
async def send_code(req: SendCodeRequest):
    tg = get_tg()
    phone_code_hash = await tg.send_code(req.phone)
    return {"phone_code_hash": phone_code_hash}


@router.post("/verify")
async def verify(req: VerifyRequest):
    tg = get_tg()
    try:
        await tg.verify_code(req.phone, req.code, req.phone_code_hash, req.password)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"success": True}


@router.post("/logout")
async def logout():
    tg = get_tg()
    await tg.logout()
    return {"success": True}
