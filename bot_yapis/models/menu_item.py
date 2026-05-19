from sqlalchemy import Column, ForeignKey, Integer, String, Boolean, Float
from sqlalchemy.orm import relationship

from app.database import Base

class MenuItem(Base):
    __tablename__ = "menu_items"

    id = Column(Integer, primary_key=True, index=True)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=False)
    name = Column(String, nullable=False, index=True)
    description = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    price = Column(Float, nullable=False)

    category = relationship("Category", back_populates="items")
