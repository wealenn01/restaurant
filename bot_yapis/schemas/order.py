from pydantic import BaseModel, ConfigDict
from datetime import datetime


class OrderCreate(BaseModel):
    table_id: int
    status: str = "open"
    note: str | None = None


class OrderUpdate(BaseModel):
    table_id: int | None = None
    created_by: int | None = None
    status: str | None = None
    note: str | None = None


class OrderRead(BaseModel):
    id: int
    table_id: int
    created_by: int
    status: str
    note: str | None = None
    created_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)
