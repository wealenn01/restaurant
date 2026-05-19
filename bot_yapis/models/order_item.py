from sqlalchemy import Column, ForeignKey, Integer, Float, String, DateTime, Boolean
from sqlalchemy.orm import relationship

from app.database import Base

class OrderItem(Base):
    __tablename__ = "order_items"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)
    menu_item_id = Column(Integer, ForeignKey("menu_items.id"), nullable=False)
    quantity = Column(Integer, nullable=False, default=1)
    unit_price = Column(Float, nullable=False)


    order = relationship("Order", back_populates="items")