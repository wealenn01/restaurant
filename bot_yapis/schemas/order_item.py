from pydantic import BaseModel,ConfigDict

class OrderItemBase(BaseModel):
    order_id: int
    menu_item_id: int
    quantity: int=1
    unit_price: float


class OrderItemCreate(OrderItemBase):
    pass

class OrderItemUpdate(BaseModel):
    quantity: int | None = None
    unit_price: float | None = None

class OrderItemRead(BaseModel):
    id: int
    order_id: int
    menu_item_id: int
    quantity: int
    unit_price: float

    model_config = ConfigDict(from_attributes=True)


