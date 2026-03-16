from contextlib import asynccontextmanager
import os

import aiosqlite
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from telethon.errors import AuthKeyError

from database import init_db
from routes.auth import router as auth_router, set_tg
from telegram_client import TelegramClientWrapper

load_dotenv()

DB_PATH = os.getenv("DB_PATH", "telegram_viewer.db")


@asynccontextmanager
async def lifespan(app: FastAPI):
    api_id = int(os.getenv("TELEGRAM_API_ID", "0"))
    api_hash = os.getenv("TELEGRAM_API_HASH", "")

    # Init database
    db = await aiosqlite.connect(DB_PATH)
    await init_db(db)
    app.state.db = db

    # Init Telegram client
    tg = TelegramClientWrapper(api_id=api_id, api_hash=api_hash)
    await tg.connect()
    app.state.tg = tg
    set_tg(tg)

    yield

    await db.close()
    await tg.disconnect()


app = FastAPI(title="Telegram Media Viewer", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(AuthKeyError)
async def auth_key_error_handler(request: Request, exc: AuthKeyError):
    return JSONResponse(status_code=401, content={"detail": "Session invalid or revoked"})


app.include_router(auth_router)


@app.get("/health")
async def health():
    return {"status": "ok"}
