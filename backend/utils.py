from __future__ import annotations

import asyncio
import logging

logger = logging.getLogger(__name__)

_background_tasks: set[asyncio.Task] = set()


def fire_and_forget(coro) -> asyncio.Task:
    """Create a tracked background task that won't be GC'd."""
    task = asyncio.create_task(coro)
    _background_tasks.add(task)

    def _on_done(t: asyncio.Task) -> None:
        _background_tasks.discard(t)
        if t.cancelled():
            return
        exc = t.exception()
        if exc:
            logger.error("Background task failed: %s", exc, exc_info=exc)

    task.add_done_callback(_on_done)
    return task
