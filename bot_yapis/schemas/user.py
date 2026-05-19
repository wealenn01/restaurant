from pydantic import BaseModel,ConfigDict,Field,EmailStr
from typing import Optional,Literal

class UserCreate(BaseModel):

    username: str = Field(min_length=3,max_length=30)
    email: EmailStr
    password: str = Field(min_length=8,max_length=50)

class UserCreateByAdmin(BaseModel):
    username: str = Field(min_length=3,max_length=30)
    email: EmailStr
    password: str = Field(min_length=8,max_length=50)
    role : Literal["admin","staff"] = "staff"

class UserLogin(BaseModel):
    username: str
    password: str
    
class UserRead(BaseModel):
    id: int
    username: str
    email: EmailStr
    role: Literal["admin","staff"]
    is_active: bool

    model_config = ConfigDict(from_attributes=True)



