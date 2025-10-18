from __future__ import with_statement
from logging.config import fileConfig
from alembic import context
from sqlalchemy import create_engine

# Alembic config object (values from alembic.ini)
config = context.config

# Optional logging configuration; skip if logging sections are absent
try:
    if config.config_file_name is not None:
        fileConfig(config.config_file_name)
except Exception:
    # No logging configuration found; continue without configuring loggers
    pass

from app.db.session import Base
from app.db import base as models  # noqa: F401  (import models for metadata)
from app.core.config import settings


def run_migrations_offline() -> None:
    url = settings.db_url
    context.configure(
        url=url,
        target_metadata=Base.metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    # Use sync driver for running migrations
    connectable = create_engine(settings.db_url.replace("+aiosqlite", ""))

    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=Base.metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
