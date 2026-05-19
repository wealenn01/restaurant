from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import select
from app.database import get_db
from fastapi import HTTPException
from models.order_item import OrderItem
from schemas.order_item import OrderItemRead, OrderItemCreate, OrderItemUpdate

router = APIRouter(prefix="/order_items", tags=["order_items"])

@router.get("/health")
def order_items_health():
    return {"module": "order_items", "status": "ok"}

@router.get("/", response_model = list[OrderItemRead],summary="order items listesi",description="bu endpoint order items listesini döner")
def get_order_items(order_id: int | None = None, db: Session = Depends(get_db)):
    stmt = select(OrderItem).order_by(OrderItem.id)
    
    if order_id is not None:
        stmt = stmt.where(OrderItem.order_id == order_id)
    
    return list(db.scalars(stmt).all())


@router.post("/", response_model = OrderItemRead,status_code=201,summary="order item oluştur",description="bu endpoint order item oluşturur")
def create_order_item(payload: OrderItemCreate, db: Session = Depends(get_db)):
    db_order_item = OrderItem(**payload.model_dump())

    db.add(db_order_item)
    db.commit()
    db.refresh(db_order_item)
    
    return db_order_item


@router.put("/{order_item_id}", response_model = OrderItemRead,summary="order item güncelle",description="bu endpoint order item günceller")
def update_order_item(order_item_id: int, payload: OrderItemUpdate, db: Session = Depends(get_db)):
    order_item = db.get(OrderItem, order_item_id)

    if not order_item:
        raise HTTPException(status_code=404, detail="Order item not found")
    
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(order_item, field, value)

    db.commit()
    db.refresh(order_item)
    return order_item


@router.delete("/{order_item_id}", status_code=204,summary="order item siler",description="bu endpoint order item siler")
def delete_order_item(order_item_id: int, db: Session = Depends(get_db)):
    item = db.get(OrderItem, order_item_id)

    if not item:
        raise HTTPException(status_code=404, detail="Order item not found")

    db.delete(item)
    db.commit()
    return None
