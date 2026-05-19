from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.database import get_db
from models.floor import Floor
from models.layout_item import LayoutItem
from models.table import Table
from routes.admin import require_admin
from schemas.layout import (
    FloorCreate,
    FloorRead,
    FloorUpdate,
    LayoutItemCreate,
    LayoutItemRead,
    LayoutItemUpdate,
)


router = APIRouter(prefix="/layout", tags=["layout"])


def ensure_default_floors(db: Session) -> None:
    existing = db.scalar(select(func.count()).select_from(Floor)) or 0
    if existing:
        return

    db.add_all(
        [
            Floor(name="1. Kat", position=1),
            Floor(name="2. Kat", position=2),
        ]
    )
    db.commit()


def next_table_number(db: Session) -> int:
    used_numbers = list(
        db.scalars(
            select(Table.number)
            .join(LayoutItem, LayoutItem.table_id == Table.id)
            .where(LayoutItem.type == "table")
        ).all()
    )
    return (max(used_numbers) if used_numbers else 0) + 1


def ensure_table_number_available(
    db: Session,
    table_number: int,
    current_item_id: int | None = None,
) -> None:
    existing_item = db.scalar(
        select(LayoutItem)
        .join(Table, LayoutItem.table_id == Table.id)
        .where(
            LayoutItem.type == "table",
            Table.number == table_number,
            LayoutItem.id != current_item_id,
        )
    )
    if existing_item:
        raise HTTPException(status_code=400, detail="Bu masa numarası zaten haritada kullanılıyor")


def get_or_create_layout_table(
    db: Session,
    table_id: int | None,
    table_number: int | None,
    current_item_id: int | None = None,
) -> Table:
    if table_id is not None:
        table = db.get(Table, table_id)
        if not table:
            raise HTTPException(status_code=404, detail="Table not found")
        ensure_table_number_available(db, table.number, current_item_id)
        return table

    if table_number is not None:
        if table_number < 1:
            raise HTTPException(status_code=400, detail="Masa numarası 1 veya daha büyük olmalı")
        ensure_table_number_available(db, table_number, current_item_id)
        table = db.scalar(select(Table).where(Table.number == table_number))
        if table:
            return table
        number = table_number
    else:
        number = next_table_number(db)

    table = db.scalar(select(Table).where(Table.number == number))
    if table:
        return table

    table = Table(number=number, capacity=4, status="empty")
    db.add(table)
    db.flush()
    return table


@router.get("/floors", response_model=list[FloorRead])
def list_floors(db: Session = Depends(get_db)):
    return list(db.scalars(select(Floor).order_by(Floor.position, Floor.id)).all())


@router.post("/floors", response_model=FloorRead, status_code=status.HTTP_201_CREATED)
def create_floor(
    payload: FloorCreate,
    db: Session = Depends(get_db),
    _admin=Depends(require_admin),
):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Floor name is required")

    existing = db.scalar(select(Floor).where(Floor.name == name))
    if existing:
        raise HTTPException(status_code=400, detail="Floor name already exists")

    position = payload.position
    if position is None:
        position = (db.scalar(select(func.max(Floor.position))) or 0) + 1

    floor = Floor(name=name, position=position)
    db.add(floor)
    db.commit()
    db.refresh(floor)
    return floor


@router.put("/floors/{floor_id}", response_model=FloorRead)
def update_floor(
    floor_id: int,
    payload: FloorUpdate,
    db: Session = Depends(get_db),
    _admin=Depends(require_admin),
):
    floor = db.get(Floor, floor_id)
    if not floor:
        raise HTTPException(status_code=404, detail="Floor not found")

    if payload.name is not None:
        name = payload.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Floor name is required")
        existing = db.scalar(select(Floor).where(Floor.name == name, Floor.id != floor_id))
        if existing:
            raise HTTPException(status_code=400, detail="Floor name already exists")
        floor.name = name

    if payload.position is not None:
        floor.position = payload.position

    db.commit()
    db.refresh(floor)
    return floor


@router.delete("/floors/{floor_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_floor(
    floor_id: int,
    db: Session = Depends(get_db),
    _admin=Depends(require_admin),
):
    floor = db.get(Floor, floor_id)
    if not floor:
        raise HTTPException(status_code=404, detail="Floor not found")

    db.execute(delete(LayoutItem).where(LayoutItem.floor_id == floor_id))
    db.delete(floor)
    db.commit()
    return None


@router.get("/floors/{floor_id}/items", response_model=list[LayoutItemRead])
def list_floor_items(floor_id: int, db: Session = Depends(get_db)):
    floor = db.get(Floor, floor_id)
    if not floor:
        raise HTTPException(status_code=404, detail="Floor not found")

    stmt = select(LayoutItem).where(LayoutItem.floor_id == floor_id).order_by(LayoutItem.id)
    return list(db.scalars(stmt).all())


@router.post("/items", response_model=LayoutItemRead, status_code=status.HTTP_201_CREATED)
def create_layout_item(
    payload: LayoutItemCreate,
    db: Session = Depends(get_db),
    _admin=Depends(require_admin),
):
    floor = db.get(Floor, payload.floor_id)
    if not floor:
        raise HTTPException(status_code=404, detail="Floor not found")

    table_id = payload.table_id
    label = payload.label
    if payload.type == "table":
        table = get_or_create_layout_table(db, payload.table_id, payload.table_number)
        table_id = table.id
        label = label or f"Masa {table.number}"

    data = payload.model_dump(exclude={"table_number"})
    data["table_id"] = table_id
    data["label"] = label
    item = LayoutItem(**data)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.put("/items/{item_id}", response_model=LayoutItemRead)
def update_layout_item(
    item_id: int,
    payload: LayoutItemUpdate,
    db: Session = Depends(get_db),
    _admin=Depends(require_admin),
):
    item = db.get(LayoutItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Layout item not found")

    data = payload.model_dump(exclude_unset=True, exclude={"table_number"})
    if "floor_id" in data and not db.get(Floor, data["floor_id"]):
        raise HTTPException(status_code=404, detail="Floor not found")

    if item.type == "table" and (payload.table_id is not None or payload.table_number is not None):
        table = get_or_create_layout_table(
            db,
            payload.table_id,
            payload.table_number,
            current_item_id=item.id,
        )
        data["table_id"] = table.id
        data["label"] = data.get("label") or f"Masa {table.number}"

    for field, value in data.items():
        setattr(item, field, value)

    db.commit()
    db.refresh(item)
    return item


@router.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_layout_item(
    item_id: int,
    db: Session = Depends(get_db),
    _admin=Depends(require_admin),
):
    item = db.get(LayoutItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Layout item not found")

    db.delete(item)
    db.commit()
    return None
