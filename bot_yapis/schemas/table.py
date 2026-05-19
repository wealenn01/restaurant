from pydantic import BaseModel,ConfigDict


class TableBase(BaseModel):
    number: int
    capacity: int = 4
    status: str = "empty"


class TableCreate(TableBase):
    pass

class TableUpdate(BaseModel):
    number: int | None = None
    capacity: int | None = None
    status: str | None = None

class TableRead(BaseModel):
    id: int
    number: int
    capacity: int
    status: str

    model_config = ConfigDict(from_attributes=True)

