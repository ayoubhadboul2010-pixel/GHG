from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from .config import settings

database_url = settings.database_url

# Support Render PostgreSQL URLs
if database_url.startswith("postgres://"):
    database_url = database_url.replace("postgres://", "postgresql://", 1)

connect_args = (
    {"check_same_thread": False}
    if database_url.startswith("sqlite")
    else {}
)

engine = create_engine(
    database_url,
    connect_args=connect_args,
    future=True,
    pool_pre_ping=True,
)

# Keep the existing SQLite migration
if database_url.startswith("sqlite"):
    with engine.begin() as conn:
        inspector = inspect(engine)
        if inspector.has_table("users"):
            cols = {c["name"] for c in inspector.get_columns("users")}
            if "wallet_address" not in cols:
                conn.execute(text(
                    "ALTER TABLE users ADD COLUMN wallet_address "
                    "VARCHAR(128) NOT NULL DEFAULT ''"
                ))
            conn.execute(text(
                "UPDATE users SET rate = 0.01 WHERE level <= 1"
            ))

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
)

class Base(DeclarativeBase):
    pass

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
