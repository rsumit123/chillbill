"""In-process daily scheduler that materializes due recurring rules.

Uses APScheduler AsyncIOScheduler. Runs once at startup (catchup) and daily at
05:00 UTC (~10:30 IST). Idempotent — materialize_due_rules skips rules already
advanced past today.
"""
from __future__ import annotations

import logging
from datetime import date

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from app.db.session import SessionLocal
from app.services.recurring_expenses import materialize_due_rules


logger = logging.getLogger(__name__)

_scheduler: AsyncIOScheduler | None = None


async def _run_once() -> None:
    async with SessionLocal() as db:
        try:
            n = await materialize_due_rules(db, today=date.today())
            logger.info("recurring: materialized %d expense(s)", n)
        except Exception:
            logger.exception("recurring: materialization failed")


def start_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        return
    sched = AsyncIOScheduler(timezone="UTC")
    sched.add_job(
        _run_once,
        CronTrigger(hour=5, minute=0),
        id="materialize_recurring",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    sched.start()
    _scheduler = sched
    logger.info("recurring: scheduler started (daily @ 05:00 UTC)")


async def run_startup_catchup() -> None:
    """Awaited from FastAPI startup event to cover any missed days."""
    await _run_once()


def shutdown_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
