from __future__ import annotations

import asyncio
import logging

logger = logging.getLogger(__name__)


def fire_and_forget(coro, task_set: set[asyncio.Task]) -> asyncio.Task:
    """Create a tracked background task that won't be GC'd."""
    task = asyncio.create_task(coro)
    task_set.add(task)

    def _on_done(t: asyncio.Task) -> None:
        task_set.discard(t)
        if t.cancelled():
            return
        exc = t.exception()
        if exc:
            logger.error("Background task failed: %s", exc, exc_info=exc)

    task.add_done_callback(_on_done)
    return task
