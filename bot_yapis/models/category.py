from sqlalchemy import Column, Integer, String, Boolean
from sqlalchemy.orm import relationship


from app.database import Base


class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, unique=True, index=True)
    description = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    position = Column(Integer, nullable=False, default=0)

    items = relationship("MenuItem", back_populates="category")
