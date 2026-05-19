from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.database import get_db
from models.payment import Payment
from schemas.payment import PaymentRead, PaymentCreate, PaymentUpdate
from fastapi import HTTPException

router = APIRouter(prefix="/payments", tags=["payments"])

@router.get("/health")
def payments_health():
    return {"module": "payments", "status": "ok"}

@router.get("/", response_model = list[PaymentRead],summary="payments listesi",description="bu endpoint payments listesini döner")
def get_payments(order_id: int | None = None, db: Session = Depends(get_db)):

    stmt = select(Payment).order_by(Payment.id)

    if order_id is not None:
        stmt = stmt.where(Payment.order_id == order_id)

    return list(db.scalars(stmt).all())


@router.get("/{payment_id}", response_model = PaymentRead,summary="payment detayı",description="bu endpoint payment detayını döner")
def get_payment(payment_id: int, db: Session = Depends(get_db)):
    payment = db.get(Payment, payment_id)

    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")

    return payment

@router.post("/", response_model = PaymentRead,summary="payment oluştur",description="bu endpoint payment oluşturur")
def create_payment(payload: PaymentCreate, db: Session = Depends(get_db)):
    db_payment = Payment(**payload.model_dump())
   
    db.add(db_payment)
    db.commit()
    db.refresh(db_payment)
    return db_payment

@router.put("/{payment_id}", response_model = PaymentRead,summary="payment güncelle",description="bu endpoint payment günceller")
def update_payment(payment_id: int, payload: PaymentUpdate, db: Session = Depends(get_db)):
    
    payment = db.get(Payment, payment_id)

    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(payment, field, value)

    db.commit()
    db.refresh(payment)
    return payment

@router.delete("/{payment_id}", status_code=204,summary="payment sil",description="bu endpoint payment siler")
def delete_payment(payment_id: int, db: Session = Depends(get_db)):

    payment = db.get(Payment, payment_id)

    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    
    db.delete(payment)
    db.commit()
    return None