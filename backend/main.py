from contextlib import asynccontextmanager
import asyncio
import os

import aiosqlite
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from telethon.errors import AuthKeyError

from database import init_db
from routes.auth import router as auth_router
from routes.groups import router as groups_router
from routes.media import router as media_router
from routes.faces import router as faces_router
from telegram_client import TelegramClientWrapper

load_dotenv()

DB_PATH = os.getenv("DB_PATH", "telegram_viewer.db")


@asynccontextmanager
async def lifespan(app: FastAPI):
    api_id = int(os.getenv("TELEGRAM_API_ID", "0"))
    api_hash = os.getenv("TELEGRAM_API_HASH", "")

    # Shared state
    app.state.background_tasks = set()
    app.state.sync_status = {}
    app.state.zip_jobs = {}  # dict[str, dict] — async zip job status

    # Init database
    db = await aiosqlite.connect(DB_PATH)
    await init_db(db)
    app.state.db = db

    # Init Telegram client
    tg = TelegramClientWrapper(
        api_id=api_id,
        api_hash=api_hash,
        background_tasks=app.state.background_tasks,
    )
    tg.set_db(db)
    await tg.connect()
    app.state.tg = tg

    yield

    # Cancel all background tasks and wait for them to finish
    for task in app.state.background_tasks:
        task.cancel()
    if app.state.background_tasks:
        await asyncio.gather(*app.state.background_tasks, return_exceptions=True)

    await tg.disconnect()
    await db.close()


app = FastAPI(title="Telegram Media Viewer", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,  # type: ignore[arg-type]
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(AuthKeyError)
async def auth_key_error_handler(_request: Request, _exc: AuthKeyError):
    return JSONResponse(
        status_code=401, content={"detail": "Session invalid or revoked"}
    )


app.include_router(auth_router)
app.include_router(groups_router)
app.include_router(media_router)
app.include_router(faces_router)


@app.get("/health")
async def health():
    return {"status": "ok"}
