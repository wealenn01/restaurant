import sys
from pathlib import Path

here = Path(__file__).resolve()

root = here.parent.parent


root_str = str(root)

if root_str not in sys.path:
    sys.path.insert(0, root_str)


import models
from app.database import engine, Base, SessionLocal
from sqlalchemy import select

from models.table import Table

# Garson planı (frontend WAITER_TABLE_REGIONS) ile aynı sayı — eksik numaralar eklenir
FLOOR_TABLE_COUNT = 9


def seed_floor_tables() -> int:
    """number 1..FLOOR_TABLE_COUNT masaları yoksa oluşturur (tekrar çalıştırılabilir)."""
    db = SessionLocal()
    try:
        existing = {t.number for t in db.scalars(select(Table)).all()}
        added = 0
        for n in range(1, FLOOR_TABLE_COUNT + 1):
            if n in existing:
                continue
            db.add(Table(number=n, capacity=4, status="empty"))
            added += 1
        if added:
            db.commit()
        return added
    finally:
        db.close()


def main():
    Base.metadata.create_all(bind=engine)
    print("Database tables created successfully")
    n = seed_floor_tables()
    if n:
        print(f"Garson planı için {n} masa eklendi (number 1..{FLOOR_TABLE_COUNT}).")
    else:
        print(
            f"Masalar zaten tanımlı (1..{FLOOR_TABLE_COUNT} kontrol edildi). "
            "Sadece masa eklemek için: python scripts/seed_floor_tables.py"
        )


if __name__ == "__main__":
    main()
