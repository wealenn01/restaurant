from pydantic import BaseModel,ConfigDict

class MenuItemBase(BaseModel):
    pass


class MenuItemCreate(BaseModel):
    category_id: int
    name: str
    description: str | None = None
    is_active: bool
    price: float

class MenuItemUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    is_active: bool | None = None
    price: float | None = None

class MenuItemRead(BaseModel):
    id: int
    category_id: int
    name: str
    description: str | None = None
    is_active: bool
    price: float

    model_config = ConfigDict(from_attributes=True)
