from pydantic import BaseModel,ConfigDict


class PaymentBase(BaseModel):
    order_id: int
    amount: float
    method: str
    status: str = "pending"



class PaymentCreate(PaymentBase):
    pass

class PaymentUpdate(BaseModel):
    order_id: int | None = None
    amount: float | None = None
    method: str | None = None
    status: str | None = None

class PaymentRead(BaseModel):
    id: int
    order_id: int
    amount: float
    method: str
    status: str

    model_config = ConfigDict(from_attributes=True)

