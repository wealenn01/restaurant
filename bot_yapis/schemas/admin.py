from typing import Literal
from pydantic import BaseModel, EmailStr, Field


class AdminUserRoleUpdate(BaseModel):
    role: Literal["admin", "staff"]


class AdminUserActiveUpdate(BaseModel):
    is_active: bool


class AdminUserInfoUpdate(BaseModel):
    username: str | None = Field(default=None, min_length=3, max_length=30)
    email: EmailStr | None = None
    password: str | None = Field(default=None, min_length=8, max_length=50)