from typing import Literal

from pydantic import BaseModel, ConfigDict


class FloorRead(BaseModel):
    id: int
    name: str
    position: int

    model_config = ConfigDict(from_attributes=True)


class FloorCreate(BaseModel):
    name: str
    position: int | None = None


class FloorUpdate(BaseModel):
    name: str | None = None
    position: int | None = None


class LayoutItemBase(BaseModel):
    floor_id: int
    type: Literal["table", "chair", "wall"]
    x: float = 0
    y: float = 0
    width: float = 80
    height: float = 80
    rotation: float = 0
    label: str | None = None


class LayoutItemCreate(LayoutItemBase):
    table_id: int | None = None
    table_number: int | None = None


class LayoutItemUpdate(BaseModel):
    floor_id: int | None = None
    x: float | None = None
    y: float | None = None
    width: float | None = None
    height: float | None = None
    rotation: float | None = None
    label: str | None = None
    table_id: int | None = None
    table_number: int | None = None


class LayoutTableRead(BaseModel):
    id: int
    number: int
    capacity: int
    status: str

    model_config = ConfigDict(from_attributes=True)


class LayoutItemRead(BaseModel):
    id: int
    floor_id: int
    type: str
    x: float
    y: float
    width: float
    height: float
    rotation: float
    label: str | None = None
    table_id: int | None = None
    table: LayoutTableRead | None = None

    model_config = ConfigDict(from_attributes=True)
