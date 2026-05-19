import os
from pathlib import Path
from urllib.parse import quote_plus

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# Çalışma dizini nerede olursa olsun bot_yapis/.env yüklensin (uvicorn yanlış cwd → 500 önlenir)
_BOT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(_BOT_ROOT / ".env")

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    DB_USER = os.getenv("DB_USER","postgres")
    DB_PASSWORD = os.getenv("DB_PASSWORD","postgres")
    DB_HOST = os.getenv("DB_HOST","db")
    DB_PORT = os.getenv("DB_PORT","5432")
    DB_NAME = os.getenv("DB_NAME","restaurant_db")

    _u = quote_plus(DB_USER)
    _p = quote_plus(DB_PASSWORD)
    DATABASE_URL = f"postgresql+psycopg2://{_u}:{_p}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

engine = create_engine(DATABASE_URL,future = True)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()