"""
Garson salon planındaki 9 alan için DB'de number=1..9 masaları yoksa ekler.
Tekrar çalıştırılabilir (mevcut numaralar atlanır).

Kullanım (bot_yapis kökünden):
  python scripts/seed_floor_tables.py
"""
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
if str(root) not in sys.path:
    sys.path.insert(0, str(root))

from sqlalchemy import select

from app.database import SessionLocal
from models.table import Table

FLOOR_TABLE_COUNT = 9


def main() -> None:
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
        print(f"Tamam: {added} yeni masa, zaten vardı {len(existing)} kayıt.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
