from pydantic import BaseModel, ConfigDict


class CategoryCreate(BaseModel):
    name: str
    description: str | None = None

class CategoryRead(BaseModel):
    id: int
    name: str
    description: str | None = None	
    is_active: bool
    position: int
    model_config = ConfigDict(from_attributes=True)

class CategoryUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    is_active: bool | None = None
    position: int | None = None

    
