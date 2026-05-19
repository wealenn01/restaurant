from fastapi import APIRouter
from fastapi import Depends
from sqlalchemy.orm import Session
from sqlalchemy import select, delete

from app.database import get_db
from models.order import Order
from models.order_item import OrderItem
from models.payment import Payment
from schemas.order import OrderRead, OrderCreate, OrderUpdate
from fastapi import HTTPException
from app.security import get_current_user_id

router = APIRouter(prefix="/orders", tags=["orders"])

@router.get("/health")
def orders_health():
    return {"module": "orders", "status": "ok"}


@router.get("/", response_model = list[OrderRead], summary="orders listesi", description="bu endpoint orders listesini döner")
def get_orders(
    db: Session = Depends(get_db),
    status: str | None = None,
    table_id: int | None = None,
):
    stmt = select(Order).order_by(Order.id.asc())

    if status is not None:
        stmt = stmt.where(Order.status == status)

    if table_id is not None:
        stmt = stmt.where(Order.table_id == table_id)

    return list(db.scalars(stmt).all())

@router.get("/{order_id}", response_model = OrderRead,summary="order detayi",description="bu endpoint order detayını döner")
def get_order(order_id: int, db: Session = Depends(get_db)):
    order = db.get(Order, order_id)

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    return order

@router.post("/", response_model = OrderRead, summary="order oluştur", description="bu endpoint order oluşturur")
def create_order(
    payload: OrderCreate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    db_order = Order(
        table_id=payload.table_id,
        created_by=user_id,
        status=payload.status,
        note=payload.note,
    )
    db.add(db_order)
    db.commit()
    db.refresh(db_order)
    return db_order


@router.put("/{order_id}", response_model = OrderRead,summary="order güncelle",description="bu endpoint order günceller")
def update_order(order_id: int, payload: OrderUpdate, db: Session = Depends(get_db)):
    order = db.get(Order, order_id)

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(order, field, value)
    
    db.commit()
    db.refresh(order)
    return order

@router.delete("/{order_id}", status_code=204,summary="order sil",description="bu endpoint order siler")
def delete_order(order_id: int, db: Session = Depends(get_db)):
    order = db.get(Order, order_id)

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    db.execute(delete(OrderItem).where(OrderItem.order_id == order_id))
    db.execute(delete(Payment).where(Payment.order_id == order_id))
    db.execute(delete(Order).where(Order.id == order_id))
    db.commit()
    return None